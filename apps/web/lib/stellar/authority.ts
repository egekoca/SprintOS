/**
 * Who may do what on an engagement.
 *
 * These two are the client-side echo of the contract's own authorization: the
 * chain decides for real, and a wallet that gets past this file still gets
 * turned away by `require_auth`. They live apart from the rest of the contract
 * client because they are pure, they are the rules everyone reasons about, and
 * a question this important should be answerable without loading a Stellar SDK.
 */

/** The shape these answers actually depend on — not the whole engagement. */
export interface Authority {
  sponsor: string;
  builder: string;
  reviewers: string[];
}

export type Role = "sponsor" | "builder" | "reviewer" | "observer";

/**
 * Which role an address plays in an engagement.
 *
 * This is the entire authorization model of the web app: no accounts, no
 * passwords, no sessions. What you may do follows from which key you hold, and
 * the contract independently enforces the same thing — the UI hiding a button
 * is a convenience, not the control.
 */
export function roleOf(engagement: Authority, address: string | null): Role {
  if (!address) return "observer";
  if (address === engagement.sponsor) return "sponsor";
  if (address === engagement.builder) return "builder";
  if (engagement.reviewers.includes(address)) return "reviewer";
  return "observer";
}

/**
 * Whether this wallet may approve, hold or release on this engagement.
 *
 * The sponsor always may — they defined the milestones and funded them. Anyone
 * they authorised may too. The builder never may, whatever else is true, and
 * the contract enforces that independently of this function.
 */
export function canDecide(engagement: Authority, address: string | null): boolean {
  if (!address) return false;
  if (address === engagement.builder) return false;
  return address === engagement.sponsor || engagement.reviewers.includes(address);
}
