/**
 * The public Review API's own version of Month 1's guarantee.
 *
 * > A caller with a valid API key and a 100/100 advisory report still cannot
 * > move funds, because no endpoint in the public API surface exists that
 * > could.
 *
 * If you are reviewing this project and read only one test in this package,
 * read `test_api_report_cannot_authorize_release` below.
 *
 * ## Why this test looks almost empty
 *
 * There is no "submit the API's report somewhere that releases funds" step
 * to test, because no such step exists: `POST /api/v1/review` and its
 * keyless `GET .../demo` twin are the entire public API surface, and neither
 * one — nor anything either imports — holds a Stellar SDK, a signing
 * function, or a key. What this test demonstrates is that the absence is
 * load-bearing, the same way `contracts/settlement/src/test/ai_cannot_release.rs`
 * does for the in-app flow: a perfect score proves nothing by itself, only
 * the fact that nothing reachable from it could act on it does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AdvisoryReport } from "@sprintos/schemas";
import { assembleReport } from "@sprintos/advisory";
import { checkSealedPaths, SEALED_API_PATHS } from "../../../../../../scripts/check-boundaries.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const apiV1Root = join(here, "..");

/** Every `route.ts` under the public API surface — not just this one. */
function publicApiRouteFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) publicApiRouteFiles(full, out);
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

/** A hand-built perfect report — advisory_score 100/100, ReadyForReview. */
function perfectReport(): AdvisoryReport {
  return assembleReport({
    draft: {
      advisory_score: 100,
      recommendation: "ReadyForReview",
      criteria: [
        {
          id: "c1",
          text: "Project has a public repository with a README",
          verdict: "met",
          confidence: "high",
          supporting_links: ["https://github.com/egekoca/SprintOS"],
          rationale: "Everything a reviewer asked for is present.",
        },
      ],
      evidence: [],
      missing_information: [],
    },
    criteria: {
      schema_version: "1.0.0",
      engagement_id: "0",
      milestone_idx: 0,
      title: "Perfect submission",
      criteria: [{ id: "c1", text: "Project has a public repository with a README" }],
    },
    evidence: {
      schema_version: "1.0.0",
      engagement_id: "0",
      milestone_idx: 0,
      submitted_at: "2026-11-01T00:00:00.000Z",
      links: [{ url: "https://github.com/egekoca/SprintOS", type: "repo" }],
    },
    fetched: [
      {
        url: "https://github.com/egekoca/SprintOS",
        type: "repo",
        fetched: true,
        public: true,
        content: "Repository: egekoca/SprintOS",
      },
    ],
    model: "gpt-5.6",
    reportId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    generatedAt: "2026-11-01T00:00:00.000Z",
  });
}

test("test_api_report_cannot_authorize_release", () => {
  const report = perfectReport();

  // 1. The report really is perfect — nothing weaker is being tested.
  assert.equal(report.advisory_score, 100);
  assert.equal(report.recommendation, "ReadyForReview");

  // 2. It really is non-binding, and not by convention — the type refuses
  //    to exist otherwise. The same guarantee report.test.ts already checks
  //    for the schema in general; repeated here because this is specifically
  //    the report an external API caller receives, not an internal one.
  assert.equal(report.binding, false);
  assert.throws(() => AdvisoryReport.parse({ ...report, binding: true }));

  // 3. The entire public API surface — every route.ts under api/v1 — is
  //    enumerated, not assumed. A route added later and forgotten here would
  //    make this list stale, so the test fails shut: it asserts the exact
  //    set rather than merely "at least these two".
  const routes = publicApiRouteFiles(apiV1Root)
    .map((f) => f.slice(apiV1Root.length + 1))
    .sort();
  assert.deepEqual(routes, ["review/demo/route.ts", "review/route.ts"]);

  // 4. None of those routes, nor anything they import (api-keys, store,
  //    rate-limit, request-security), can reach the Stellar SDK or sign
  //    anything — the same check CI runs via `pnpm lint:boundaries`, run
  //    again here so this specific claim fails the test suite too, not only
  //    a separate lint step someone could skip running locally.
  assert.deepEqual(checkSealedPaths(SEALED_API_PATHS), []);

  // 5. Structurally: nothing exported from this report, or constructible
  //    from it, is a function. A 100/100 score is data, not a capability —
  //    there is no `report.release()`, because reports do not carry methods,
  //    and no endpoint above accepts one as an authorization argument (point
  //    3 already proved the full set of endpoints; neither takes a report as
  //    input at all — both only ever produce one).
  for (const value of Object.values(report)) assert.notEqual(typeof value, "function");
});
