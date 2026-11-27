import { z } from "zod";
import { MAX_CRITERIA, MAX_MILESTONES } from "./milestone.ts";

/**
 * Multi-reviewer approval, without touching the settlement contract.
 *
 * The contract lets any one authorized reviewer decide a milestone alone — by
 * design, see `contracts/settlement/src/lib.rs`. The Statement of Work still
 * asks for a configurable "two of three reviewers" workflow. Rather than
 * redeploy the contract that is about to hold real funds to add on-chain vote
 * counting, the threshold is enforced here, in front of that one real
 * signature: the application will not surface the final Approve/Release step
 * until enough distinct authorized reviewers have attested, but the call that
 * actually moves money is still exactly the contract's own `approve` /
 * `release`, signed by one of them. An AI recommendation is not a reviewer and
 * can never be one of these attestations.
 */

export const ATTESTATION_SCHEMA_VERSION = "1.0.0" as const;

export const AttestationDecision = z.enum(["approve", "hold"]);
export type AttestationDecision = z.infer<typeof AttestationDecision>;

export const CriterionFeedback = z.object({
  id: z.string().min(1),
  comment: z.string().min(1).max(500),
});
export type CriterionFeedback = z.infer<typeof CriterionFeedback>;

export const ReviewerAttestation = z.object({
  schema_version: z.literal(ATTESTATION_SCHEMA_VERSION),
  engagement_id: z.string().regex(/^(0|[1-9]\d*)$/, "Attestation must reference a numeric engagement id"),
  milestone_idx: z.number().int().min(0).max(MAX_MILESTONES - 1),
  /**
   * Which evidence version this attestation judges. A revision produces a new
   * evidence hash and therefore a new review context — an attestation against
   * the previous version never counts toward the current one.
   */
  evidence_hash: z.string().regex(/^[0-9a-f]{64}$/),
  reviewer: z.string().regex(/^G[A-Z2-7]{55}$/, "Expected a Stellar account id"),
  decision: AttestationDecision,
  comment: z.string().max(1000).optional(),
  criteria_feedback: z.array(CriterionFeedback).max(MAX_CRITERIA).default([]),
  attested_at: z.iso.datetime(),
});
export type ReviewerAttestation = z.infer<typeof ReviewerAttestation>;

/**
 * What a sponsor sets once, at setup: how many distinct reviewers must
 * attest "approve" on the current evidence before the UI exposes the
 * contract's real Approve/Release step.
 *
 * 1 is the contract's own default — any one authorized reviewer decides
 * alone. This document only ever makes that number stricter, never looser:
 * it cannot authorize anyone the contract itself has not already authorized
 * as a reviewer.
 */
export const ApprovalPolicy = z.object({
  schema_version: z.literal(ATTESTATION_SCHEMA_VERSION),
  engagement_id: z.string().regex(/^(0|[1-9]\d*)$/),
  threshold: z.number().int().min(1).max(3),
});
export type ApprovalPolicy = z.infer<typeof ApprovalPolicy>;
