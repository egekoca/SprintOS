import type { Engagement } from "./stellar/contract.ts";

/**
 * What the whole programme has actually done, counted from the ledger.
 *
 * Every number here is derived from engagements read off chain — nothing is
 * stored, incremented or remembered by the application. That matters more than
 * it sounds: a dashboard whose figures live in a database is a claim, and this
 * project's entire argument is that claims should be checkable. Anyone can
 * recompute all of this from the contract.
 */

export interface Totals {
  /** Engagements that exist at all, funded or not. */
  engagements: number;
  /** Milestones the reviewer approved and that were paid out. */
  milestonesPaid: number;
  /** Milestones defined across every engagement. */
  milestonesTotal: number;
  /** Distinct builder addresses that have received a payment. */
  buildersPaid: number;
  /** Distinct sponsor addresses that have funded an engagement. */
  sponsors: number;
  /** USDC that has actually reached a builder, in stroops. */
  distributed: bigint;
  /** USDC still locked in escrow against unsettled milestones. */
  inEscrow: bigint;
  /** USDC returned to sponsors after a missed deadline. */
  reclaimed: bigint;
}

export interface BuilderStanding {
  address: string;
  /** Rank by amount earned, 1-based. Ties share the lower number. */
  rank: number;
  earned: bigint;
  milestonesPaid: number;
  engagements: number;
  /** Milestones assigned to them that have not settled either way. */
  outstanding: number;
}

const ZERO: Totals = {
  engagements: 0,
  milestonesPaid: 0,
  milestonesTotal: 0,
  buildersPaid: 0,
  sponsors: 0,
  distributed: 0n,
  inEscrow: 0n,
  reclaimed: 0n,
};

export function totalsOf(engagements: readonly Engagement[]): Totals {
  const builders = new Set<string>();
  const sponsors = new Set<string>();
  let totals = { ...ZERO, engagements: engagements.length };

  for (const e of engagements) {
    /* A Draft engagement was defined but never funded. Its milestones are real
       intentions and are counted as such, but no money was ever committed. */
    if (e.status !== "Draft") sponsors.add(e.sponsor);

    for (const m of e.milestones) {
      totals.milestonesTotal += 1;
      if (m.status === "Released") {
        totals.milestonesPaid += 1;
        totals.distributed += m.amount;
        builders.add(e.builder);
      } else if (m.status === "Refunded") {
        totals.reclaimed += m.amount;
      } else if (e.status !== "Draft") {
        totals.inEscrow += m.amount;
      }
    }
  }

  totals = { ...totals, buildersPaid: builders.size, sponsors: sponsors.size };
  return totals;
}

/**
 * Builders ranked by what they have actually been paid.
 *
 * Paid, not promised. A builder holding three funded milestones nobody has
 * approved yet has earned nothing, and a board that counted the promise would
 * reward signing up rather than delivering.
 */
export function standings(engagements: readonly Engagement[]): BuilderStanding[] {
  const byBuilder = new Map<string, Omit<BuilderStanding, "rank">>();

  for (const e of engagements) {
    const row = byBuilder.get(e.builder) ?? {
      address: e.builder,
      earned: 0n,
      milestonesPaid: 0,
      engagements: 0,
      outstanding: 0,
    };
    row.engagements += 1;

    for (const m of e.milestones) {
      if (m.status === "Released") {
        row.earned += m.amount;
        row.milestonesPaid += 1;
      } else if (m.status !== "Refunded") {
        row.outstanding += 1;
      }
    }
    byBuilder.set(e.builder, row);
  }

  const ordered = [...byBuilder.values()].sort((a, b) => {
    if (a.earned !== b.earned) return a.earned > b.earned ? -1 : 1;
    if (a.milestonesPaid !== b.milestonesPaid) return b.milestonesPaid - a.milestonesPaid;
    /* Address last, so the order is stable rather than dependent on the order
       the ledger happened to return engagements in. */
    return a.address < b.address ? -1 : 1;
  });

  /* Standard competition ranking: equal earnings share a rank, and the next
     distinct value skips ahead. Two builders on 1,000 are both second. */
  let lastEarned: bigint | null = null;
  let lastRank = 0;
  return ordered.map((row, index) => {
    const rank = lastEarned !== null && row.earned === lastEarned ? lastRank : index + 1;
    lastEarned = row.earned;
    lastRank = rank;
    return { ...row, rank };
  });
}

export interface BoardPage {
  /** The rows to render for the requested page. */
  rows: BuilderStanding[];
  page: number;
  pageCount: number;
  /**
   * The viewer's own standing, when it is not already on the page in front of
   * them. Someone who ranks 47th should still be able to see that they rank
   * 47th without paging through to find it.
   */
  pinned: BuilderStanding | null;
}

export const PAGE_SIZE = 10;

export function pageOf(
  all: readonly BuilderStanding[],
  page: number,
  viewer: string | null,
): BoardPage {
  const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  const rows = all.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const mine = viewer ? (all.find((row) => row.address === viewer) ?? null) : null;
  const alreadyShown = mine !== null && rows.some((row) => row.address === mine.address);

  return { rows, page: current, pageCount, pinned: alreadyShown ? null : mine };
}
