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
