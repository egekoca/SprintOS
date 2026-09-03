import type { EvidenceLink } from "@sprintos/schemas";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Retrieval of public evidence.
 *
 * Three hard limits, each one a line in the Statement of Work:
 *
 * - **Public only.** A private or missing resource is reported as
 *   `public: false` and never opened. There is no token that would grant
 *   access to a private repository, and no code path that would use one.
 * - **Metadata, not code.** Repositories are read through the GitHub REST API —
 *   description, languages, README, commit messages, diff *statistics*. Nothing
 *   is cloned.
 * - **Never executed.** Fetched content is text handed to a language model. No
 *   part of this module runs, builds, or evaluates anything it retrieves.
 */

/** A hard ceiling on what any single source may contribute to the prompt. */
const MAX_CHARS_PER_SOURCE = 6_000;
const MAX_BYTES_PER_RESPONSE = 1_000_000;
const FETCH_TIMEOUT_MS = 10_000;

export interface FetchedEvidence {
  url: string;
  type: EvidenceLink["type"];
  fetched: boolean;
  public: boolean;
  /** Human-readable digest of the source, capped in length. */
  content: string;
  error?: string;
}

const USER_AGENT = "SprintOS-Advisory/0.1 (+https://github.com/egekoca/SprintOS)";

function githubHeaders(): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
  };
}

export function isPublicIp(address: string): boolean {
  if (address.includes(":")) {
    const value = address.toLowerCase();
    if (value === "::" || value === "::1") return false;
    if (/^(fc|fd)/.test(value) || /^fe[89ab]/.test(value) || value.startsWith("ff")) return false;
    const mapped = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPublicIp(mapped) : true;
  }

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts as [number, number, number, number];
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

async function assertPublicHttps(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Evidence URLs must be credential-free HTTPS URLs.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Local and private network addresses are not allowed.");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error("Local, reserved, and private network addresses are not allowed.");
  }
}

async function get(url: string, headers: Record<string, string>): Promise<Response> {
  await assertPublicHttps(url);
  return fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // Redirect targets would need a fresh DNS/IP validation. Refusing them is
    // safer and keeps the submitted URL identical to the retrieved resource.
    redirect: "error",
  });
}

async function readLimitedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES_PER_RESPONSE) {
    throw new Error("The evidence response is too large.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES_PER_RESPONSE) {
      await reader.cancel();
      throw new Error("The evidence response is too large.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * The slices of GitHub's API this module actually reads.
 *
 * Every field is optional because none of it is guaranteed: the response may be
 * an error body, a shape that changed, or a repository with nothing in it. The
 * module summarizes what it finds and says so when a field is missing, rather
 * than pretending the API is a contract.
 */
interface GitHubRepo {
  full_name?: string;
  description?: string;
  default_branch?: string;
  stargazers_count?: number;
  open_issues_count?: number;
  pushed_at?: string;
}

interface GitHubCommit {
  sha?: string;
  commit?: { message?: string; author?: { name?: string; date?: string } };
  stats?: { additions?: number; deletions?: number };
  files?: Array<{ filename?: string; status?: string }>;
}

interface GitHubPull {
  number?: number;
  title?: string;
  state?: string;
  merged_at?: string | null;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  body?: string | null;
}

async function readJson<T>(response: Response): Promise<T> {
  return JSON.parse(await readLimitedText(response)) as T;
}

function clamp(text: string): string {
  const trimmed = text.replace(/\s+\n/g, "\n").trim();
  return trimmed.length > MAX_CHARS_PER_SOURCE
    ? `${trimmed.slice(0, MAX_CHARS_PER_SOURCE)}\n…[truncated]`
    : trimmed;
}

interface GitHubTarget {
  owner: string;
  repo: string;
  kind: "repo" | "commit" | "pull" | "file" | "dir" | "other";
  ref?: string;
  /** Path within the repository, for `file` and `dir` targets. */
  path?: string;
}

/**
 * Work out what a GitHub link is actually pointing at.
 *
 * `blob` and `tree` matter more than they look. When a builder opens a file on
 * github.com and copies the address bar — which is what anybody does — they get
 * a `blob` URL. Treating that as "some repository" and summarizing the
 * repository instead used to hand the model five lines of star counts in place
 * of the source file it was asked to check, and every criterion came back
 * `cannot_verify`. The most natural way to submit evidence was the one that
 * worked worst.
 */
export function parseGitHubUrl(url: string): GitHubTarget | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;

  const parts = u.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  const [owner, repo, section, ref, ...rest] = parts;
  if (!owner || !repo) return null;

  if (!section) return { owner, repo, kind: "repo" };
  if (section === "commit" && ref) return { owner, repo, kind: "commit", ref };
  if (section === "pull" && ref) return { owner, repo, kind: "pull", ref };

  /* `blob`/`tree` are `<section>/<ref>/<path…>`. A tree URL with no path left
     is the repository root on a branch, which is just the repository. */
  if ((section === "blob" || section === "tree") && ref) {
    const path = rest.join("/");
    if (!path) return { owner, repo, kind: "repo" };
    return { owner, repo, kind: section === "blob" ? "file" : "dir", ref, path };
  }

  return { owner, repo, kind: "other" };
}

/**
 * Refuse anything that is not publicly readable.
 *
 * GitHub answers 404 for private repositories the caller cannot see, so both
 * the explicit `private` flag and a 404 mean the same thing to us: do not look.
 */
function privacyVerdict(status: number, body?: { private?: boolean }): { ok: boolean; reason?: string } {
  if (status === 404) {
    return { ok: false, reason: "Not found, or private. Private sources are never opened." };
  }
  if (status === 403) return { ok: false, reason: "Access refused by GitHub (rate limit or permissions)." };
  if (!String(status).startsWith("2")) return { ok: false, reason: `GitHub returned HTTP ${status}.` };
  if (body?.private) return { ok: false, reason: "Repository is private. Private sources are never opened." };
  return { ok: true };
}

/** How many directory entries are worth listing before it stops being evidence. */
const MAX_DIR_ENTRIES = 60;

/** Percent-encode each path segment, leaving the separators alone. */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/* The contents API hands back raw bytes for any file, so an image or a wasm
   blob arrives as mojibake. Passing that to the model wastes the budget and
   tells it nothing. */
function looksBinary(text: string): boolean {
  const sample = text.slice(0, 1000);
  if (sample.includes("\u0000")) return true;
  const weird = sample.replace(/[\t\n\r\x20-\x7E\u00A0-\uFFFD]/g, "").length;
  return weird / Math.max(sample.length, 1) > 0.1;
}

async function fetchGitHub(link: EvidenceLink, target: GitHubTarget): Promise<FetchedEvidence> {
  const base = { url: link.url, type: link.type };
  const headers = githubHeaders();
  const api = `https://api.github.com/repos/${target.owner}/${target.repo}`;

  const repoRes = await get(api, headers);
  const repoBody = repoRes.ok ? await readJson<GitHubRepo & { private?: boolean }>(repoRes) : undefined;
  const verdict = privacyVerdict(repoRes.status, repoBody);
  if (!verdict.ok) {
    return { ...base, fetched: false, public: false, content: "", error: verdict.reason };
  }

  const lines: string[] = [
    `Repository: ${repoBody?.full_name}`,
    `Description: ${repoBody?.description ?? "(none)"}`,
    `Default branch: ${repoBody?.default_branch}`,
    `Stars: ${repoBody?.stargazers_count} · Open issues: ${repoBody?.open_issues_count}`,
    `Last pushed: ${repoBody?.pushed_at}`,
  ];

  if (target.kind === "repo") {
    const readme = await get(`${api}/readme`, { ...headers, Accept: "application/vnd.github.raw" });
    if (readme.ok) lines.push("", "README:", clamp(await readLimitedText(readme)));
  }

  /* A file the builder pointed at, read as raw text through the contents API.
     Same credential-free request and same size ceiling as every other source —
     only the endpoint is different. */
  if (target.kind === "file" && target.ref && target.path) {
    const res = await get(
      `${api}/contents/${encodePath(target.path)}?ref=${encodeURIComponent(target.ref)}`,
      { ...headers, Accept: "application/vnd.github.raw" },
    );
    if (!res.ok) {
      return {
        ...base,
        fetched: false,
        public: true,
        content: lines.join("\n"),
        error: `File not readable (HTTP ${res.status}).`,
      };
    }
    const text = await readLimitedText(res);
    if (looksBinary(text)) {
      lines.push("", `File: ${target.path} @ ${target.ref}`, "(binary file, not read)");
    } else {
      lines.push("", `File: ${target.path} @ ${target.ref}`, "", clamp(text));
    }
  }

  /* A directory listing. Names and sizes only — the point of a `tree` link is
     usually "these files exist", and fetching every one of them would blow the
     prompt budget on a single piece of evidence. */
  if (target.kind === "dir" && target.ref && target.path) {
    const res = await get(
      `${api}/contents/${encodePath(target.path)}?ref=${encodeURIComponent(target.ref)}`,
      headers,
    );
    if (!res.ok) {
      return {
        ...base,
        fetched: false,
        public: true,
        content: lines.join("\n"),
        error: `Directory not readable (HTTP ${res.status}).`,
      };
    }
    const entries = await readJson<Array<{ name?: string; type?: string; size?: number }>>(res);
    if (Array.isArray(entries)) {
      lines.push("", `Directory: ${target.path} @ ${target.ref} — ${entries.length} entries`);
      for (const entry of entries.slice(0, MAX_DIR_ENTRIES)) {
        const suffix = entry.type === "dir" ? "/" : ` (${entry.size ?? 0} bytes)`;
        lines.push(`  ${entry.name}${suffix}`);
      }
      if (entries.length > MAX_DIR_ENTRIES) {
        lines.push(`  …and ${entries.length - MAX_DIR_ENTRIES} more`);
      }
    }
  }

  if (target.kind === "commit" && target.ref) {
    const res = await get(`${api}/commits/${target.ref}`, headers);
    if (!res.ok) {
      return { ...base, fetched: false, public: true, content: lines.join("\n"), error: `Commit not readable (HTTP ${res.status}).` };
    }
    const c = await readJson<GitHubCommit>(res);
    lines.push(
      "",
      `Commit ${c.sha?.slice(0, 10)} by ${c.commit?.author?.name} on ${c.commit?.author?.date}`,
      `Message: ${c.commit?.message}`,
      `Changes: +${c.stats?.additions} / -${c.stats?.deletions} across ${c.files?.length ?? 0} files`,
      // File names and counts only. Patch bodies are deliberately not read:
      // the module reviews whether evidence exists, not the source itself.
      `Files: ${(c.files ?? []).slice(0, 40).map((f) => `${f.filename} (${f.status})`).join(", ")}`,
    );
  }

  if (target.kind === "pull" && target.ref) {
    const res = await get(`${api}/pulls/${target.ref}`, headers);
    if (!res.ok) {
      return { ...base, fetched: false, public: true, content: lines.join("\n"), error: `Pull request not readable (HTTP ${res.status}).` };
    }
    const p = await readJson<GitHubPull>(res);
    lines.push(
      "",
      `Pull request #${p.number}: ${p.title}`,
      `State: ${p.state}${p.merged_at ? ` (merged ${p.merged_at})` : ""}`,
      `Changes: +${p.additions} / -${p.deletions} across ${p.changed_files} files`,
      `Description: ${clamp(p.body ?? "(empty)")}`,
    );
  }

  return { ...base, fetched: true, public: true, content: clamp(lines.join("\n")) };
}

/** Strip markup so the model reads prose, not a DOM. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

async function fetchPage(link: EvidenceLink): Promise<FetchedEvidence> {
  const base = { url: link.url, type: link.type };
  try {
    const res = await get(link.url, { "User-Agent": USER_AGENT, Accept: "text/html,text/plain,*/*" });
    if (res.status === 401 || res.status === 403) {
      return { ...base, fetched: false, public: false, content: "", error: "The page requires authentication. Private sources are never opened." };
    }
    if (!res.ok) {
      return { ...base, fetched: false, public: true, content: "", error: `HTTP ${res.status}.` };
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/^(text\/|application\/(json|xml|xhtml\+xml))/i.test(contentType)) {
      return { ...base, fetched: false, public: true, content: "", error: `Unsupported content type: ${contentType}.` };
    }
    const body = await readLimitedText(res);
    const text = contentType.includes("html") ? htmlToText(body) : body;
    return { ...base, fetched: true, public: true, content: clamp(text) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      fetched: false,
      public: true,
      content: "",
      error: message.includes("abort") ? "The request timed out." : message,
    };
  }
}

/**
 * Retrieve one evidence link.
 *
 * Never throws: a source that cannot be read becomes a report entry saying so,
 * because "the module could not see this" is a finding a reviewer needs, not an
 * error that should take the whole report down.
 */
export async function fetchEvidence(link: EvidenceLink): Promise<FetchedEvidence> {
  const target = parseGitHubUrl(link.url);
  try {
    return target ? await fetchGitHub(link, target) : await fetchPage(link);
  } catch (err) {
    return {
      url: link.url,
      type: link.type,
      fetched: false,
      public: true,
      content: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Retrieve every link concurrently. Order matches the input. */
export function fetchAllEvidence(links: readonly EvidenceLink[]): Promise<FetchedEvidence[]> {
  return Promise.all(links.map(fetchEvidence));
}
