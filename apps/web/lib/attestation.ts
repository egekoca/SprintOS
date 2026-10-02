import type { ReviewerAttestation } from "@sprintos/schemas";

/**
 * Whether enough distinct reviewers have attested to open the real
 * Approve/Release step.
 *
 * Only the most recent attestation per reviewer counts — a reviewer who holds
 * and later approves the same version should not be tallied twice, and should
 * not still count toward "hold" after changing their mind. An AI report is
 * never a candidate input here: nothing in `ReviewerAttestation` carries a
 * score, and this function only ever reads reviewer-signed decisions.
 */
export interface ApprovalTally {
  threshold: number;
  approvals: string[];
  holds: string[];
  met: boolean;
}

export function tallyAttestations(
  attestations: readonly ReviewerAttestation[],
  evidenceHash: string,
  threshold: number,
): ApprovalTally {
  const latestByReviewer = new Map<string, ReviewerAttestation>();
  for (const a of attestations) {
    if (a.evidence_hash !== evidenceHash) continue;
    const existing = latestByReviewer.get(a.reviewer);
    if (!existing || a.attested_at >= existing.attested_at) latestByReviewer.set(a.reviewer, a);
  }

  const approvals: string[] = [];
  const holds: string[] = [];
  for (const a of latestByReviewer.values()) {
    (a.decision === "approve" ? approvals : holds).push(a.reviewer);
  }

  return { threshold, approvals, holds, met: approvals.length >= threshold };
}
