/**
 * Decode the engagement id returned by `create_engagement`.
 *
 * The transaction does not carry the newly assigned id in its arguments. The
 * return value is the authoritative source, so the activity index must use it
 * instead of accepting an id supplied by the browser.
 */
export function createdEngagementId(value: unknown): string | null {
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}
