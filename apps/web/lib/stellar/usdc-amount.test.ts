import test from "node:test";
import assert from "node:assert/strict";
import { formatUsdc, parseUsdc, usdcInputValue } from "./config.ts";

/**
 * Anything the interface writes back into an amount field has to survive being
 * read again. `formatUsdc` groups thousands for display and `parseUsdc` rejects
 * separators, so using the display form to fill an input silently invalidated
 * the whole milestone plan — the split button produced "5,000" and the total
 * stayed at zero.
 */
test("amounts written into an input round-trip through the parser", () => {
  for (const stroops of [0n, 1n, 5_000_0000000n, 1_234_567_0000000n, 12345678n]) {
    assert.equal(parseUsdc(usdcInputValue(stroops)), stroops);
  }
});

test("the input form carries no thousands separators", () => {
  assert.equal(usdcInputValue(5_000_0000000n), "5000");
  assert.equal(formatUsdc(5_000_0000000n), "5,000");
});

test("an evenly split award adds back up to the original total", () => {
  const total = parseUsdc("5000");
  for (const count of [1, 3, 4, 7]) {
    const share = total / BigInt(count);
    const leftover = total - share * BigInt(count);
    const parts = Array.from({ length: count }, (_, index) =>
      parseUsdc(usdcInputValue(index === 0 ? share + leftover : share)),
    );
    assert.equal(parts.reduce((sum, part) => sum + part, 0n), total);
  }
});
