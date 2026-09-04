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
import { StoreUnavailableError, store } from "@/lib/store";
import { takeRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, requestBodyIsTooLarge, requestClientKey } from "@/lib/request-security";
import { parseGitHubRepository } from "@/lib/github";
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

/** Read the repository's root listing so the paths offered actually exist. */
async function repositoryRoot(
  owner: string,
  repo: string,
): Promise<{ entries: RepositoryEntry[]; branch: string } | null> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "sprintos-progress-check",
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const meta = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
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

  const root = await repositoryRoot(owner, repo);
  if (!root) {
    return NextResponse.json(
      { error: "That repository could not be read. Private repositories are never opened." },
      { status: 404 },
    );
  }

  const links = chooseEvidencePaths(repository, root.entries, root.branch);
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
