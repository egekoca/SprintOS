import { fetchDefaultBranch, fetchGitHubFile, fetchGitHubTree, parseGitHubUrl, type GitHubTreeEntry } from "./fetch.ts";

/**
 * Deep review's one job: read more of a repository than its README, without
 * ever running any of it.
 *
 * Everything here is a `GET` of a GitHub API endpoint, followed by treating
 * whatever comes back as inert text handed to a language model. There is no
 * `git clone`, no package install, no build step, and no code execution of
 * any kind — cloning a real repository onto a machine that then has to judge
 * hundreds of hackathon submissions is exactly the attack surface this stays
 * out of. A malicious submission can at worst make its own file content say
 * something unpleasant to the model; `prompt.ts`'s existing untrusted-content
 * framing already covers that the same way it covers a hostile README.
 *
 * The file tree is read once, filtered to drop noise (dependency
 * directories, lockfiles, binaries), then read in a fixed priority order —
 * entry points and contracts first, then tests, then everything else — until
 * a character budget runs out. What did not fit is listed by name, so the
 * report can say plainly what the model did not see, the same way a budget
 * cut partway through a long evidence list already does.
 */

const MAX_TREE_ENTRIES = 4_000;
const MAX_FILES_READ = 40;
const MAX_TOTAL_CHARS = 60_000;
const MAX_CHARS_PER_FILE = 6_000;

const NOISE_DIR = /(^|\/)(node_modules|\.git|dist|build|target|out|vendor|\.next|\.turbo|coverage)(\/|$)/i;
const NOISE_FILE = /\.(lock|lockb|svg|png|jpe?g|gif|ico|webp|woff2?|ttf|eot|wasm|zip|tar|gz|pdf|map)$/i;
const LOCKFILE = /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|Gemfile\.lock)$/i;

/** Entry points and on-chain program code — read before anything else. */
const TIER_1 = /(^|\/)(contracts?|programs?|src\/lib\.rs|lib\.rs|Anchor\.toml|Cargo\.toml|main\.(rs|go|py)|index\.(ts|js|tsx|jsx)|package\.json|README)(\/|$|\.)/i;
/** Whatever demonstrates the thing was actually tested. */
const TIER_2 = /(^|\/)(tests?|__tests__|spec)(\/|$)/i;

export interface SourceFile {
  path: string;
  content: string;
}

export interface RepositorySource {
  owner: string;
  repo: string;
  ref: string;
  files: SourceFile[];
  /** Paths that exist in the tree but were not read, in order of omission. */
  omitted: string[];
  /** GitHub's own tree API truncated the listing — the repository has more files than were ever considered. */
  treeTruncated: boolean;
}

export function isNoise(path: string): boolean {
  return NOISE_DIR.test(path) || NOISE_FILE.test(path) || LOCKFILE.test(path.split("/").pop() ?? "");
}

export function tierOf(path: string): 0 | 1 | 2 {
  if (TIER_1.test(path)) return 0;
  if (TIER_2.test(path)) return 1;
  return 2;
}

/** Shallower paths read first within a tier — a root-level file is more likely load-bearing than a deeply nested one. */
function depthOf(path: string): number {
  return path.split("/").length;
}

/**
 * Blob entries, noise dropped, in the order they will be read: entry points
 * and contracts first, then tests, then everything else — shallower paths
 * before deeper ones within a tier, alphabetical as the final tiebreak so the
 * order is deterministic rather than whatever GitHub's tree API happened to
 * return. Exported on its own so the prioritisation can be checked without
 * a network call.
 */
export function rankEntries(entries: readonly GitHubTreeEntry[]): GitHubTreeEntry[] {
  return entries
    .filter((entry) => entry.type === "blob" && !isNoise(entry.path))
    .slice(0, MAX_TREE_ENTRIES)
    .sort((a, b) => {
      const tier = tierOf(a.path) - tierOf(b.path);
      if (tier !== 0) return tier;
      const depth = depthOf(a.path) - depthOf(b.path);
      if (depth !== 0) return depth;
      return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    });
}

/**
 * Read as much of a repository's real source as the character budget allows,
 * at the given ref (branch or commit), in priority order.
 *
 * Never throws for an ordinary repository problem (empty, truncated listing,
 * an unreadable file) — those become an empty or partial `files` array, the
 * same "could not see" shape the rest of the advisory pipeline already uses.
 * Only a network-level failure on the tree listing itself propagates, since
 * without a file list there is nothing left to try reading.
 */
export async function fetchRepositorySource(
  owner: string,
  repo: string,
  ref?: string,
): Promise<RepositorySource> {
  const resolvedRef = ref ?? (await fetchDefaultBranch(owner, repo)) ?? "HEAD";
  const tree = await fetchGitHubTree(owner, repo, resolvedRef);
  const candidates = rankEntries(tree.entries);

  const files: SourceFile[] = [];
  const omitted: string[] = [];
  let budget = MAX_TOTAL_CHARS;

  for (const entry of candidates) {
    if (files.length >= MAX_FILES_READ || budget <= 0) {
      omitted.push(entry.path);
      continue;
    }
    const content = await fetchGitHubFile(owner, repo, entry.path, resolvedRef, Math.min(MAX_CHARS_PER_FILE, budget));
    if (content === null) {
      omitted.push(entry.path);
      continue;
    }
    files.push({ path: entry.path, content });
    budget -= content.length;
  }

  return { owner, repo, ref: resolvedRef, files, omitted, treeTruncated: tree.truncated };
}

/** Render a read repository as one block of text for the prompt. */
export function renderRepositorySource(source: RepositorySource): string {
  const parts = [
    `Repository source read at ${source.owner}/${source.repo}@${source.ref} ` +
      `(${source.files.length} file${source.files.length === 1 ? "" : "s"} read` +
      `${source.omitted.length > 0 ? `, ${source.omitted.length} not read for space` : ""}):`,
  ];
  for (const file of source.files) {
    parts.push("", `--- ${file.path} ---`, file.content);
  }
  if (source.omitted.length > 0) {
    parts.push("", "Not read (budget exhausted before reaching these):", ...source.omitted.map((p) => `  ${p}`));
  }
  if (source.treeTruncated) {
    parts.push("", "(The repository's own file listing was too large for GitHub to return in full; some files were never even considered.)");
  }
  return parts.join("\n");
}

export type { GitHubTreeEntry };
export { parseGitHubUrl };
