/**
 * The id range one page of engagements covers, as plain arithmetic with no
 * network or Stellar SDK in it.
 *
 * Kept out of `contract.ts` so the off-by-one cases (an empty deployment, a
 * `before` past the newest id, a page that reaches exactly the first id) can
 * be unit-tested directly — `contract.ts` re-exports from `authority.ts`
 * without a file extension, which Next.js's bundler resolves fine but Node's
 * own ESM loader cannot, so nothing in that file can be imported from a
 * plain `node --test` run.
 */
export function engagementPageRange(
  next: number,
  firstEngagementId: number,
  limit: number,
  before?: number,
): { floor: number; ceiling: number } {
  const first = Math.min(firstEngagementId, next);
  const ceiling = before !== undefined ? Math.min(before, next) : next;
  const floor = Math.max(first, ceiling - limit);
  return { floor, ceiling: Math.max(floor, ceiling) };
}
