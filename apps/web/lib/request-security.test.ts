import { test } from "node:test";
import assert from "node:assert/strict";
import { isSameOrigin, requestBodyIsTooLarge } from "./request-security.ts";

test("state-changing API requests require the deployment origin", () => {
  assert.equal(isSameOrigin(new Request("https://app.example/api/x", {
    headers: { origin: "https://app.example" },
  })), true);
  assert.equal(isSameOrigin(new Request("https://app.example/api/x", {
    headers: { origin: "https://evil.example" },
  })), false);
});

test("forwarded public origins are recognized behind a proxy", () => {
  const request = new Request("http://127.0.0.1:3000/api/x", {
    headers: {
      origin: "https://app.example",
      "x-forwarded-host": "app.example",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(isSameOrigin(request), true);
});

test("oversized declared request bodies are rejected", () => {
  assert.equal(requestBodyIsTooLarge(new Request("https://app.example", {
    headers: { "content-length": "40000" },
  })), true);
});
