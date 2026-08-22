import type { EngagementStatus, MilestoneStatus } from "@/lib/stellar/contract";

/**
 * Status as a pill.
 *
 * None of these wear brand orange. A status is a fact about the ledger, and
 * orange in this interface means "a human may act here" — mixing the two would
 * blur the one distinction the whole design is built to keep sharp.
 */
const LABELS: Record<MilestoneStatus, { text: string; className: string }> = {
  Pending: { text: "Awaiting work", className: "pill-pending" },
  EvidenceSubmitted: { text: "Needs review", className: "pill-submitted" },
  Approved: { text: "Approved", className: "pill-approved" },
  Held: { text: "On hold", className: "pill-held" },
  Released: { text: "Paid", className: "pill-released" },
  Refunded: { text: "Reclaimed", className: "pill-refunded" },
};

export function StatusPill({ status }: { status: MilestoneStatus }) {
  const entry = LABELS[status] ?? { text: status, className: "pill-neutral" };
  return <span className={`pill ${entry.className}`}>{entry.text}</span>;
}

const ENGAGEMENT_LABELS: Record<EngagementStatus, { text: string; className: string }> = {
  Draft: { text: "Not funded", className: "pill-pending" },
  Funded: { text: "Funded", className: "pill-approved" },
  Closed: { text: "Settled", className: "pill-refunded" },
};

export function EngagementPill({ status }: { status: EngagementStatus }) {
  const entry = ENGAGEMENT_LABELS[status] ?? { text: status, className: "pill-neutral" };
  return <span className={`pill ${entry.className}`}>{entry.text}</span>;
}
