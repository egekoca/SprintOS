"use client";

import Link from "next/link";
import type { Engagement, Milestone } from "@/lib/stellar/contract";
import { canDecide } from "@/lib/stellar/contract";

/**
 * What this wallet can actually do about this milestone, right here.
 *
 * The builder had a page, the reviewer had another, and both showed the same
 * milestone from a different door. The roles are on chain, so the row can
 * simply offer the one action that belongs to whoever is looking — and offer
 * nothing at all to everyone else, which is most visitors.
 *
 * Signing still happens on the desk that shows the criteria and the evidence
 * side by side. This is the way in, not a shortcut past the reading.
 */
export function MilestoneActions({
  engagement,
  milestone,
  index,
  address,
  onSubmitProof,
}: {
  engagement: Engagement;
  milestone: Milestone;
  index: number;
  address: string | null;
  /** Opens the evidence form on this row rather than sending them elsewhere. */
  onSubmitProof?: (index: number) => void;
}) {
  if (!address) return null;

  const isBuilder = address === engagement.builder;
  const decides = canDecide(engagement, address);

  if (isBuilder && (milestone.status === "Pending" || milestone.status === "Held")) {
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={() => onSubmitProof?.(index)}>
        Submit proof
      </button>
    );
  }

  if (isBuilder && milestone.status === "Approved") {
    return (
      <Link href="/builder" className="btn btn-primary btn-sm">
        Claim payment
      </Link>
    );
  }

  if (decides && milestone.status === "EvidenceSubmitted") {
    return (
      <Link href={`/review/${engagement.id}/${index}`} className="btn btn-primary btn-sm">
        Review
      </Link>
    );
  }

  if (decides && milestone.status === "Approved") {
    return (
      <Link href={`/review/${engagement.id}/${index}`} className="btn btn-primary btn-sm">
        Release payment
      </Link>
    );
  }

  return null;
}
