import { hashesMatch } from "./document-hash.ts";

/**
 * Whether the reviewer's decision buttons may be pressed.
 *
 * This is the product's central UI guarantee: a reviewer never decides against
 * a document this deployment cannot prove is the one the sponsor funded. It
 * used to be four expressions inline in the desk component, where no test could
 * reach it, which was an odd place to leave the one rule the whole screen is
 * built around.
 *
 * It is a convenience, not the control. The contract independently requires the
 * reviewer's own signature and refuses anyone else regardless of what this page
 * chooses to enable. But if this gate is wrong, a reviewer can be shown one set
 * of terms while signing against another — so it is worth being sure about.
 */

/** Whether a document could be shown, and whether it is the one that was funded. */
export type DocumentState = "verified" | "mismatch" | "absent";

/**
 * Compare a document this deployment holds against the hash on the ledger.
 *
 * "absent" and "mismatch" are kept apart deliberately. One means this
 * deployment cannot show the document; the other means the document it can show
 * is not the one that was funded. Both block a decision, but only the second is
 * a red flag, and telling a reviewer their hashes "differ" when the file is
 * simply missing sends them looking for the wrong problem.
 */
export function documentState(
  document: unknown | null,
  computedHash: string | null | undefined,
  anchoredHash: string | null | undefined,
): DocumentState {
  /* An empty anchored hash is the same situation as no anchored hash: there is
     nothing on the ledger to check the document against, so holding a file
     proves nothing. */
  if (!anchoredHash) return "absent";
  if (document === null) return "absent";
  return hashesMatch(computedHash, anchoredHash) ? "verified" : "mismatch";
}

export interface ReviewGateInput {
  criteria: unknown | null;
  criteriaHash: string | null;
  anchoredCriteriaHash: string | null;
  evidence: unknown | null;
  evidenceHash: string | null;
  anchoredEvidenceHash: string | null;
}

export interface ReviewGate {
  criteria: DocumentState;
  evidence: DocumentState;
  /** True only when both documents were shown and both matched the ledger. */
  decisionsEnabled: boolean;
  /** Why the buttons are off, in words the reviewer can act on. */
  blockedBecause: string | null;
}

export function reviewGate(input: ReviewGateInput): ReviewGate {
  const criteria = documentState(input.criteria, input.criteriaHash, input.anchoredCriteriaHash);
  const evidence = documentState(input.evidence, input.evidenceHash, input.anchoredEvidenceHash);
  const decisionsEnabled = criteria === "verified" && evidence === "verified";

  return {
    criteria,
    evidence,
    decisionsEnabled,
    blockedBecause: decisionsEnabled
      ? null
      : criteria === "mismatch" || evidence === "mismatch"
        ? "A document does not match the hash recorded on chain. Do not decide against it."
        : "This deployment cannot show both documents, so there is nothing to decide against yet.",
  };
}

/**
 * The advisory report is deliberately not an argument to any of this.
 *
 * Nothing in `ReviewGateInput` carries a score, a recommendation or a report of
 * any kind, so there is no value an advisory module could return that would
 * change what this function decides. That is the same shape the contract has:
 * search its interface for "score" and there is nothing to find either.
 */
export const ADVISORY_IS_NOT_AN_INPUT = true;
