/**
 * Contract status enums, decoded.
 *
 * `contracts/settlement/src/types.rs` gives both enums explicit discriminants,
 * and `scValToNative` hands them back as plain numbers rather than tagged
 * objects. The decoder used to read `status.tag`, which is undefined for a
 * number, so the raw digit fell through to the interface: every status pill
 * rendered "2" or "4" instead of "Funded" or "Paid".
 *
 * Kept free of any SDK import so it can be tested on its own.
 */

export type MilestoneStatus =
  | "Pending" | "EvidenceSubmitted" | "Approved" | "Held" | "Released" | "Refunded";
export type EngagementStatus = "Draft" | "Funded" | "Closed";

/** Index is the discriminant the contract assigns. Order is load-bearing. */
export const MILESTONE_STATUSES: MilestoneStatus[] = [
  "Pending",
  "EvidenceSubmitted",
  "Approved",
  "Held",
  "Released",
  "Refunded",
];

export const ENGAGEMENT_STATUSES: EngagementStatus[] = ["Draft", "Funded", "Closed"];

/**
 * Accepts the numeric discriminant the SDK currently returns, and the tagged
 * or bare-string forms in case a future SDK decodes them differently. Throws
 * on anything else rather than letting an unknown value reach the screen.
 */
export function decodeStatus<T extends string>(raw: unknown, names: readonly T[]): T {
  if (typeof raw === "number" || typeof raw === "bigint") {
    const name = names[Number(raw)];
    if (name !== undefined) return name;
  }
  const tag = (raw as { tag?: unknown } | null | undefined)?.tag;
  if (typeof tag === "string" && names.includes(tag as T)) return tag as T;
  if (typeof raw === "string" && names.includes(raw as T)) return raw as T;
  throw new Error(`Unrecognized contract status: ${String(raw)}`);
}
