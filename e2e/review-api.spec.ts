import { expect, test } from "@playwright/test";

/**
 * The public Review API, exercised over real HTTP rather than by importing
 * the route module directly — Next.js route handlers depend on its own
 * runtime shims (`next/server`, the `@/*` path alias) that plain Node does
 * not resolve outside of `next build`/`next start`, so this is the layer at
 * which the route's actual wiring (auth, rate limiting, deduplication, body
 * size) can honestly be tested end to end, the same reasoning
 * `public-surfaces.spec.ts` gives for testing pages in a real browser rather
 * than by importing React components.
 *
 * Minting a key requires `SPRINTOS_ADMIN_SECRET`, which `playwright.config.ts`
 * sets only for the locally-started server this file's own config spins up —
 * never for a run against a real deployment (`SPRINTOS_BASE_URL`), so the
 * key-dependent tests below skip themselves there rather than guess a secret.
 */

const againstDeployment = Boolean(process.env.SPRINTOS_BASE_URL);

test.describe("keyless surface", () => {
  test("the demo endpoint returns the fixed, non-binding sample report with no auth", async ({ request }) => {
    const res = await request.get("/api/v1/review/demo");
    expect(res.status()).toBe(200);
    const { report } = await res.json();
    expect(report.binding).toBe(false);
    expect(report.advisory_score).toBe(82);
    expect(report.recommendation).toBe("ReadyForReview");
    expect(report.report_hash).toBe(
      "sha256:4652f8319e9fc2fb21ad8ffb866309f141c95ee089cf7441b009bf581de2f87e",
    );
  });

  test("a call with no API key is refused", async ({ request }) => {
    const res = await request.post("/api/v1/review", {
      data: { title: "x", criteria: [{ id: "c1", text: "x" }], evidence_links: [{ url: "https://example.com", type: "docs" }] },
    });
    expect(res.status()).toBe(401);
  });

  test("a call with a well-formed but unknown key is refused", async ({ request }) => {
    const res = await request.post("/api/v1/review", {
      headers: { authorization: `Bearer sk_${"0".repeat(48)}` },
      data: { title: "x", criteria: [{ id: "c1", text: "x" }], evidence_links: [{ url: "https://example.com", type: "docs" }] },
    });
    expect(res.status()).toBe(401);
  });

  test("an oversized body is refused before authentication even runs", async ({ request }) => {
    const res = await request.post("/api/v1/review", {
      data: { title: "x", note: "x".repeat(40_000), criteria: [{ id: "c1", text: "x" }], evidence_links: [{ url: "https://example.com", type: "docs" }] },
    });
    expect(res.status()).toBe(413);
  });
});

test.describe("authenticated abuse paths", () => {
  test.skip(againstDeployment, "needs the local-only admin secret this config injects — not available against a real deployment");

  async function mintKey(request: import("@playwright/test").APIRequestContext, label: string, rateLimitPerHour: number) {
    const res = await request.post("/api/admin/api-keys", {
      headers: { authorization: "Bearer e2e-local-admin-secret" },
      data: { label, rate_limit_per_hour: rateLimitPerHour },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    return body.key as string;
  }

  function reviewBody() {
    return {
      title: "e2e abuse-path check",
      criteria: [{ id: "c1", text: "placeholder" }],
      evidence_links: [{ url: "https://example.com", type: "docs" }],
    };
  }

  test("a key is rate limited at the ceiling it was minted with", async ({ request }) => {
    const key = await mintKey(request, `e2e-rate-limit-${Date.now()}`, 2);

    const first = await request.post("/api/v1/review", {
      headers: { authorization: `Bearer ${key}` },
      data: reviewBody(),
    });
    // OPENAI_API_KEY is cleared for this server, so an authenticated,
    // within-limit call reaches the route's own "no advisory service
    // configured" branch rather than calling out to OpenAI.
    expect(first.status()).toBe(503);

    const second = await request.post("/api/v1/review", {
      headers: { authorization: `Bearer ${key}` },
      data: reviewBody(),
    });
    expect(second.status()).toBe(503);

    const third = await request.post("/api/v1/review", {
      headers: { authorization: `Bearer ${key}` },
      data: reviewBody(),
    });
    expect(third.status()).toBe(429);
    expect(third.headers()["retry-after"]).toBeTruthy();
  });

  /*
   * The job-lock mechanism itself (acquire/release/TTL reclaim) is unit
   * tested directly in lib/rate-limit.test.ts. A true HTTP-level race for
   * `review-api-job:<label>` is deliberately not attempted here: with
   * OPENAI_API_KEY cleared, the route's own critical section is so fast that
   * two requests fired via Promise.all rarely land inside the same window —
   * asserting on that timing would be a flaky test standing in for a real
   * one, which is worse than no test. The route wires the same lock
   * primitive the unit tests already cover; production traffic is where a
   * real overlap would actually occur.
   */
});
