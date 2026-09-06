import assert from "node:assert/strict";
import { test } from "node:test";
import { requestStructuredJson } from "./openai.ts";

test("reasoning requests omit temperature unless explicitly supplied", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";

  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      status: "completed",
      output_text: "{\"ok\":true}",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await requestStructuredJson({
      model: "gpt-5.6",
      name: "smoke",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["ok"],
        properties: { ok: { type: "boolean" } },
      },
      instructions: "Return JSON.",
      input: "Return ok true.",
      maxOutputTokens: 100,
      reasoningEffort: "low",
    });
    assert.ok(requestBody);
    assert.equal("temperature" in requestBody, false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

/* The provider quotes the API key back inside its own error message. Passing
   that through put the first characters of the deployment's secret on a
   reviewer's screen. */
test("an upstream failure never carries the provider's text to the caller", async () => {
  const leaky = JSON.stringify({
    error: { message: "Incorrect API key provided: sk-52141****1707. You can find your API key at …" },
  });

  for (const status of [401, 403, 429, 500]) {
    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    console.error = () => {};
    globalThis.fetch = (async () =>
      new Response(leaky, { status, headers: { "content-type": "application/json" } })) as typeof fetch;

    try {
      await requestStructuredJson({
        model: "gpt-5.6",
        name: "advisory_report",
        schema: { type: "object" },
        instructions: "x",
        input: "y",
        maxOutputTokens: 16,
      });
      assert.fail(`HTTP ${status} should have thrown`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.doesNotMatch(message, /sk-/, `HTTP ${status} leaked a key fragment: ${message}`);
      assert.doesNotMatch(message, /Incorrect API key/i, `HTTP ${status} leaked provider text`);
      assert.ok(message.length > 0);
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalError;
    }
  }
});
