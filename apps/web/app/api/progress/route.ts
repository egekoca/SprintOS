import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AdvisoryUnavailableError,
  chooseEvidencePaths,
  generateReport,
  repositoryEvidence,
  ReportValidationError,
  type RepositoryEntry,
} from "@sprintos/advisory";
import type { EvidenceLink } from "@sprintos/schemas";
import { StoreUnavailableError, store } from "@/lib/store";
import { takeRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, requestBodyIsTooLarge, requestClientKey } from "@/lib/request-security";
import { parseGitHubRepository } from "@/lib/github";
import { cookies } from "next/headers";
import { GITHUB_SESSION_COOKIE, decryptGitHubSession } from "@/lib/github-auth";
import type { CriteriaDocument } from "@sprintos/schemas";

/**
 * "How much of this looks done?" — asked of the repository, not the builder.
 *
 * The advisory endpoint next door reads what a builder chose to submit. This
 * one reads the repository itself, because the person who wrote the milestones
 * and funded them should be able to look before anyone submits anything.
 *
 * The result is weaker evidence and the response says so. Nobody selected these
 * links, nothing about them is anchored on chain, and this route cannot change
 * a milestone's status any more than the other one can — the only thing that
 * can is a signed transaction from a human.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  engagement_id: z.string().regex(/^(0|[1-9]\d*)$/),
  milestone_idx: z.number().int().min(0).max(2),
  criteria_hash: z.string().regex(/^(?:sha256:)?[0-9a-f]{64}$/i),
  repository: z.string().min(1).max(200),
});

/**
 * GitHub allows sixty unauthenticated calls an hour per address, and one
 * progress check spends several. Set GITHUB_TOKEN and the ceiling is five
 * thousand.
 */
class RateLimited extends Error {
  readonly resetAt: number | null;
  constructor(reset: string | null) {
    super("rate limited");
    this.resetAt = reset ? Number(reset) * 1000 : null;
  }
}

/** Read the repository's root listing so the paths offered actually exist. */
async function repositoryRoot(
  owner: string,
  repo: string,
  headers: Record<string, string>,
): Promise<{ entries: RepositoryEntry[]; branch: string } | null> {
  const meta = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  /* Rate limiting is not "repository not found", and the difference matters: a
     check that quietly proceeds with no evidence produces a score of zero, and
     a reviewer reading 0/100 concludes the work is missing rather than that we
     never looked. */
  if (meta.status === 403 || meta.status === 429) {
    const remaining = meta.headers.get("x-ratelimit-remaining");
    if (remaining === "0") throw new RateLimited(meta.headers.get("x-ratelimit-reset"));
  }
  if (!meta.ok) return null;
  const branch = ((await meta.json()) as { default_branch?: string }).default_branch ?? "main";

  const listing = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/?ref=${branch}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!listing.ok) return { entries: [], branch };

  const raw = (await listing.json()) as Array<{ name?: string; type?: string }>;
  if (!Array.isArray(raw)) return { entries: [], branch };

  return {
    branch,
    entries: raw
      .filter((e): e is { name: string; type: string } => typeof e.name === "string")
      .map((e) => ({ name: e.name, type: e.type === "dir" ? "dir" : "file" })),
  };
}

/**
 * Swap a directory link for a file inside it, where there is an obvious one.
 *
 * A `tree` link lists names and sizes. That tells the model a `docs` folder has
 * nine things in it, which is almost nothing — the first version of this check
 * scored a milestone 35 that scored 98 once the builder linked the one document
 * inside that folder. Five links is the whole budget, so each one has to carry
 * content rather than an index.
 */
/** One directory listing, or an empty list when it cannot be read. */
async function listPath(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  headers: Record<string, string>,
): Promise<Array<{ name?: string; type?: string; path?: string }>> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      { headers, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body) ? body : [];
  } catch {
    return [];
  }
}

async function openDirectories(
  owner: string,
  repo: string,
  branch: string,
  repository: string,
  links: EvidenceLink[],
  headers: Record<string, string>,
): Promise<EvidenceLink[]> {
  const out: EvidenceLink[] = [];
  for (const link of links) {
    const path = link.url.includes(`/tree/${branch}/`)
      ? link.url.split(`/tree/${branch}/`)[1]
      : null;
    if (!path) {
      out.push(link);
      continue;
    }
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
        { headers, signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) {
        out.push(link);
        continue;
      }
      const inside = (await res.json()) as Array<{ name?: string; type?: string; path?: string }>;
      if (!Array.isArray(inside)) {
        out.push(link);
        continue;
      }

      /* One level deeper when the folder is an index rather than the thing:
         `.github` holds `workflows`, and a `docs` folder often keeps the run
         write-ups in `evidence`. Stopping at the first listing picked
         `dependabot.yml` over the CI definition, which is the wrong file by a
         wide margin. */
      const deeper = inside.find(
        (e) => e.type === "dir" && /^(workflows|evidence|proofs?|reports?|src)$/i.test(e.name ?? ""),
      );
      const candidates = deeper?.path ? await listPath(owner, repo, branch, deeper.path, headers) : inside;

      const pick = (re: RegExp) =>
        candidates.find((e) => e.type === "file" && re.test(e.name ?? ""));

      /* Prose first: a write-up says what was built. Then source, which at
         least shows it exists. Configuration last — a lockfile tells a
         reviewer nothing they can use. */
      const best =
        pick(/^readme\.mdx?$/i) ??
        pick(/\.(md|markdown)$/i) ??
        pick(/\.(sol|rs|ts|tsx|go|py)$/i) ??
        pick(/^(ci|main|build|test)\.ya?ml$/i) ??
        pick(/\.(ya?ml|toml|json)$/i);

      out.push(
        best?.path
          ? { url: `${repository}/blob/${branch}/${best.path}`, type: link.type, label: link.label }
          : link,
      );
    } catch {
      out.push(link);
    }
  }
  return out;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin progress checks are not allowed." }, { status: 403 });
  }
  if (requestBodyIsTooLarge(request)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  const rate = takeRateLimit(`progress:${requestClientKey(request)}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many progress checks. Try again in a moment." },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send an engagement_id, milestone_idx, criteria_hash and repository." }, { status: 400 });
  }

  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseGitHubRepository(parsed.repository));
  } catch {
    return NextResponse.json({ error: "That does not look like a public GitHub repository." }, { status: 400 });
  }
  const repository = `https://github.com/${owner}/${repo}`;

  /* The criteria are read by their on-chain hash, exactly as the reviewer desk
     reads them. A progress check is still judged against the requirements that
     were actually funded, not against anything typed into this request. */
  let criteria: CriteriaDocument | null;
  try {
    criteria = await store.getCriteria(parsed.criteria_hash);
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      return NextResponse.json({ error: "The document store is not reachable." }, { status: 503 });
    }
    throw error;
  }
  if (!criteria) {
    return NextResponse.json({ error: "The acceptance criteria for this milestone are not stored here." }, { status: 404 });
  }
  if (criteria.milestone_idx !== parsed.milestone_idx) {
    return NextResponse.json({ error: "Those criteria belong to a different milestone." }, { status: 400 });
  }

  /**
   * Read GitHub as whoever is signed in.
   *
   * Sixty calls an hour is the unauthenticated ceiling, shared across everyone
   * arriving from the same address — on a hosted deployment that is everyone at
   * once, and a handful of scores exhausts it. A signed-in visitor brings their
   * own five thousand, which is the limit that should be spent on reading their
   * own repository anyway.
   *
   * The token is read from the encrypted session cookie the OAuth flow already
   * sets, never from anything the caller can put in the request.
   */
  const jar = await cookies();
  const sessionToken = decryptGitHubSession(jar.get(GITHUB_SESSION_COOKIE)?.value)?.accessToken;
  const token = sessionToken ?? process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "sprintos-progress-check",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };

  let root: Awaited<ReturnType<typeof repositoryRoot>>;
  try {
    root = await repositoryRoot(owner, repo, headers);
  } catch (error) {
    if (error instanceof RateLimited) {
      const minutes = error.resetAt ? Math.max(1, Math.ceil((error.resetAt - Date.now()) / 60_000)) : null;
      return NextResponse.json(
        {
          error:
            (sessionToken
              ? `GitHub is rate limiting your account${minutes ? `, and resets in about ${minutes} minutes` : ""}.`
              : `GitHub is rate limiting this deployment${minutes ? `, and resets in about ${minutes} minutes` : ""}. ` +
                "Sign in to GitHub and the check runs against your own allowance instead."),
        },
        { status: 503 },
      );
    }
    throw error;
  }
  if (!root) {
    return NextResponse.json(
      { error: "That repository could not be read. Private repositories are never opened." },
      { status: 404 },
    );
  }

  const chosen = chooseEvidencePaths(repository, root.entries, root.branch);
  const links = await openDirectories(owner, repo, root.branch, repository, chosen, headers);
  const evidence = repositoryEvidence(parsed.engagement_id, parsed.milestone_idx, links);

  try {
    const report = await generateReport({ criteria, evidence });
    return NextResponse.json({
      report,
      /* Said in the response as well as in the bundle, because a caller that
         renders this next to a real report must be able to tell them apart. */
      source: "repository",
      binding: false,
      note: "Collected from the repository, not submitted by the builder, and not anchored on chain.",
      inspected: links.map((l) => ({ url: l.url, label: l.label })),
    });
  } catch (error) {
    if (error instanceof ReportValidationError) {
      return NextResponse.json({ error: "The model returned a report that failed validation." }, { status: 502 });
    }
    if (error instanceof AdvisoryUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}
