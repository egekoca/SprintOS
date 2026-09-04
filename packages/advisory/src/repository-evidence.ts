import type { EvidenceBundle, EvidenceLink, EvidenceType } from "@sprintos/schemas";
import { MAX_EVIDENCE } from "@sprintos/schemas/milestone";

/**
 * Build an evidence bundle out of a repository, without asking the builder.
 *
 * The normal path is that a builder chooses what to submit. That is the right
 * default — they know which commit proves which requirement, and choosing is
 * part of making a claim. But a sponsor who is also the person deciding payouts
 * wants to look before anyone submits anything: they wrote the milestones, they
 * are funding them, and "how much of this is done" is a question they should be
 * able to ask on a Tuesday afternoon.
 *
 * So this points the same module at the repository itself. What comes back is
 * weaker evidence and should be read that way — nobody selected it, and nothing
 * about it is anchored on chain. It answers "does the work appear to be there",
 * not "has the builder claimed it is".
 */

/** Paths worth looking at, in the order they usually carry the most weight. */
const INTERESTING: Array<{ match: RegExp; type: EvidenceType; label: string }> = [
  { match: /^readme(\.md|\.markdown)?$/i, type: "docs", label: "README" },
  { match: /^docs?$/i, type: "docs", label: "Documentation" },
  { match: /^\.github$/i, type: "test_result", label: "CI configuration" },
  { match: /^(tests?|spec|__tests__)$/i, type: "test_result", label: "Tests" },
  { match: /^(contracts?|programs?)$/i, type: "repo", label: "Contracts" },
  { match: /^(src|lib|apps|packages)$/i, type: "repo", label: "Source" },
  { match: /^(evidence|proof)$/i, type: "docs", label: "Evidence" },
];

export interface RepositoryEntry {
  name: string;
  type: "file" | "dir";
}

/**
 * Choose which parts of a repository to show the model.
 *
 * Bounded at five because that is what an evidence bundle holds, and because a
 * prompt made of forty directory listings says less than one made of the README
 * and the test folder. The repository root always goes in: it carries the
 * description, the default branch and the README body, which is usually where a
 * project explains what it has actually built.
 */
export function chooseEvidencePaths(
  repositoryUrl: string,
  entries: readonly RepositoryEntry[],
  branch = "main",
): EvidenceLink[] {
  const base = repositoryUrl.replace(/\/+$/, "").replace(/\.git$/, "");
  const links: EvidenceLink[] = [{ url: base, type: "repo", label: "Repository" }];

  for (const { match, type, label } of INTERESTING) {
    if (links.length >= MAX_EVIDENCE) break;
    const hit = entries.find((entry) => match.test(entry.name));
    if (!hit) continue;
    /* The root README is already inside the repository summary, so spending one
       of five slots on it again would buy nothing. */
    if (/^readme/i.test(hit.name)) continue;
    const kind = hit.type === "dir" ? "tree" : "blob";
    links.push({ url: `${base}/${kind}/${branch}/${hit.name}`, type, label });
  }

  return links;
}

/**
 * Wrap those links as the bundle the advisory module already knows how to read.
 *
 * It is deliberately the same shape a builder would have submitted. The module
 * does not need to know the difference, and the report it produces is judged
 * against the same criteria either way — what differs is who chose the links,
 * which is a fact for the reader rather than for the model.
 */
export function repositoryEvidence(
  engagementId: string,
  milestoneIdx: number,
  links: readonly EvidenceLink[],
): EvidenceBundle {
  return {
    schema_version: "1.0.0",
    engagement_id: engagementId,
    milestone_idx: milestoneIdx,
    submitted_at: new Date().toISOString(),
    note:
      "Collected from the repository by SprintOS, not submitted by the builder. " +
      "Nothing here is anchored on chain.",
    links: links.slice(0, MAX_EVIDENCE) as EvidenceLink[],
  };
}
