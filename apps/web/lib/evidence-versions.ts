import type { ActivityEntry } from "@sprintos/schemas";

/**
 * The version history of one milestone's evidence, read from the activity
 * index rather than kept separately.
 *
 * The contract milestone record only ever holds the current evidence hash —
 * a resubmission overwrites it. But every `evidence_submitted` activity entry
 * already names the exact bundle it anchored at the time, and reports are
 * already keyed by `(engagement, milestone, evidence_hash)` — so the full
 * "Version 1 preserved, Version 2 new report" history the SOW asks for falls
 * out of data this deployment was already recording, without a new store.
 */
export interface EvidenceVersion {
  version: number;
  evidence_hash: string;
  submitted_at: string;
  submitted_tx_hash: string;
  /** The human decision made against this exact version, if any. */
  decision: { type: "approved" | "held"; at: string; tx_hash: string; actor: string } | null;
}

export function evidenceVersions(
  entries: readonly ActivityEntry[],
  milestoneIdx: number,
): EvidenceVersion[] {
  const scoped = entries
    .filter((entry) => entry.milestone_idx === milestoneIdx)
    .sort((a, b) => a.at.localeCompare(b.at));

  const submissions = scoped.filter(
    (entry): entry is ActivityEntry & { evidence_hash: string } =>
      entry.action === "evidence_submitted" && typeof entry.evidence_hash === "string",
  );
  const decisions = scoped.filter((entry) => entry.action === "approved" || entry.action === "held");

  return submissions.map((submission, index) => {
    const next = submissions[index + 1];
    /* The decision that landed after this submission and before the next one
       — i.e. the decision actually made against this version, not a later
       resubmission's. */
    const decision = decisions.find(
      (candidate) => candidate.at >= submission.at && (!next || candidate.at < next.at),
    );

    return {
      version: index + 1,
      evidence_hash: submission.evidence_hash,
      submitted_at: submission.at,
      submitted_tx_hash: submission.tx_hash,
      decision: decision
        ? {
            type: decision.action as "approved" | "held",
            at: decision.at,
            tx_hash: decision.tx_hash,
            actor: decision.actor,
          }
        : null,
    };
  });
}

/** The version a reviewer is currently looking at: the latest submission. */
export function currentVersion(versions: readonly EvidenceVersion[]): EvidenceVersion | null {
  return versions.length > 0 ? versions[versions.length - 1] : null;
}
