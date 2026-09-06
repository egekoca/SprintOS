type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface OpenAIResponseBody {
  status?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

/** What one report actually cost, so the bill is not a surprise at month end. */
export interface Usage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

export let lastUsage: Usage | null = null;

export interface StructuredOutputRequest {
  model: string;
  name: string;
  schema: unknown;
  instructions: string;
  input: string;
  maxOutputTokens: number;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  temperature?: number;
}

export function jsonSchemaTextFormat(name: string, schema: unknown) {
  return {
    type: "json_schema" as const,
    name,
    strict: true as const,
    schema,
  };
}

function parseResponseBody(bodyText: string): OpenAIResponseBody | null {
  try {
    return JSON.parse(bodyText) as OpenAIResponseBody;
  } catch {
    return null;
  }
}

function extractOutputText(output?: OpenAIResponseBody["output"]): string | null {
  if (!output) return null;
  for (const item of output) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string" && (content.type === "output_text" || content.type === "text")) {
        return content.text;
      }
    }
  }
  return null;
}

/**
 * Ask OpenAI for a structured JSON response and return the parsed payload.
 *
 * The caller still validates the parsed object with its own schema.
 */
export async function requestStructuredJson(request: StructuredOutputRequest): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const payload = {
    model: request.model,
    instructions: request.instructions,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: request.input }],
      },
    ],
    max_output_tokens: request.maxOutputTokens,
    reasoning: { effort: request.reasoningEffort ?? "medium" },
    store: false,
    text: { format: jsonSchemaTextFormat(request.name, request.schema) },
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  const body = parseResponseBody(bodyText);

  if (!response.ok) {
    /* The provider's own message is written for whoever holds the key, and it
       quotes that key back — a browser showed a reviewer the first characters
       of the deployment's secret because this text was passed straight
       through. What reaches the caller says what happened and what to do; the
       detail goes to the server log, where the operator can actually act on it.

       Anything with a body is logged, including a 401. A wrong key is exactly
       the failure an operator needs told about, and the log is not the place
       the leak was. */
    console.error(
      `[advisory] OpenAI request failed (HTTP ${response.status}):`,
      body?.error?.message ?? bodyText.slice(0, 500),
    );

    if (response.status === 401 || response.status === 403) {
      throw new Error("The advisory service rejected this deployment's credentials.");
    }
    if (response.status === 429) {
      throw new Error("The advisory service is rate limiting this deployment. Try again shortly.");
    }
    throw new Error(`The advisory service could not be reached (HTTP ${response.status}).`);
  }

  if (!body) {
    throw new Error("OpenAI returned a non-JSON response.");
  }

  if (body.status && body.status !== "completed") {
    const message = body.error?.message ?? `status ${body.status}`;
    throw new Error(`OpenAI response did not complete: ${message}`);
  }

  /* Record what it cost. Reasoning tokens bill as output and are invisible in
     the response, so without this the only place the bill shows up is the
     provider's dashboard a day later. */
  lastUsage = {
    inputTokens: body.usage?.input_tokens ?? 0,
    cachedInputTokens: body.usage?.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
    reasoningTokens: body.usage?.output_tokens_details?.reasoning_tokens ?? 0,
  };
  if (process.env.SPRINTOS_LOG_USAGE) {
    // biome-ignore lint/suspicious/noConsole: opt-in cost diagnostic. It is off
    // unless an operator asks for it, and the server log is where they read it.
    console.info(
      `[advisory] ${request.model} in=${lastUsage.inputTokens} ` +
        `(cached ${lastUsage.cachedInputTokens}) out=${lastUsage.outputTokens} ` +
        `(reasoning ${lastUsage.reasoningTokens})`,
    );
  }

  const outputText = body.output_text ?? extractOutputText(body.output);
  if (!outputText) {
    throw new Error("OpenAI response did not include structured text.");
  }

  try {
    return JSON.parse(outputText) as unknown;
  } catch {
    throw new Error("OpenAI returned malformed JSON.");
  }
}
