import { test } from "node:test";
import assert from "node:assert/strict";
import { isSameOrigin, requestBodyIsTooLarge, requestClientKey } from "./request-security.ts";

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

test("requestBodyIsTooLarge", async (t) => {
  await t.test("a body under the limit is allowed", () => {
    assert.equal(requestBodyIsTooLarge(req("https://x.test", { "content-length": "100" }), 1000), false);
  });

  await t.test("a body at exactly the limit is allowed", () => {
    assert.equal(requestBodyIsTooLarge(req("https://x.test", { "content-length": "1000" }), 1000), false);
  });

  await t.test("a body one byte over the limit is refused", () => {
    assert.equal(requestBodyIsTooLarge(req("https://x.test", { "content-length": "1001" }), 1000), true);
  });

  await t.test("no content-length header is not treated as oversized", () => {
    assert.equal(requestBodyIsTooLarge(req("https://x.test"), 1000), false);
  });

  await t.test("a non-numeric content-length is not treated as oversized", () => {
    assert.equal(requestBodyIsTooLarge(req("https://x.test", { "content-length": "not-a-number" }), 1000), false);
  });

  await t.test("the default limit is 32KB, matching what the review routes rely on", () => {
    assert.equal(requestBodyIsTooLarge(req("https://x.test", { "content-length": "40000" })), true);
    assert.equal(requestBodyIsTooLarge(req("https://x.test", { "content-length": "4000" })), false);
  });
});

test("isSameOrigin", async (t) => {
  await t.test("no origin header at all is refused, not assumed same-origin", () => {
    assert.equal(isSameOrigin(req("https://sprintos-ai.vercel.app/api/x")), false);
  });

  await t.test("an origin matching the request URL directly is accepted", () => {
    assert.equal(
      isSameOrigin(req("https://sprintos-ai.vercel.app/api/x", { origin: "https://sprintos-ai.vercel.app" })),
      true,
    );
  });

  await t.test("a different origin is refused", () => {
    assert.equal(
      isSameOrigin(req("https://sprintos-ai.vercel.app/api/x", { origin: "https://evil.example" })),
      false,
    );
  });

  await t.test("an origin matching the forwarded host behind a proxy is accepted", () => {
    assert.equal(
      isSameOrigin(req("http://127.0.0.1:3100/api/x", {
        origin: "https://sprintos-ai.vercel.app",
        "x-forwarded-host": "sprintos-ai.vercel.app",
        "x-forwarded-proto": "https",
      })),
      true,
    );
  });
});

test("requestClientKey", async (t) => {
  await t.test("uses the first address in x-forwarded-for", () => {
    assert.equal(
      requestClientKey(req("https://x.test", { "x-forwarded-for": "203.0.113.4, 10.0.0.1" })),
      "203.0.113.4",
    );
  });

  await t.test("falls back to x-real-ip when there is no x-forwarded-for", () => {
    assert.equal(requestClientKey(req("https://x.test", { "x-real-ip": "203.0.113.4" })), "203.0.113.4");
  });

  await t.test("falls back to a fixed label when neither header is present", () => {
    assert.equal(requestClientKey(req("https://x.test")), "local");
  });
});
