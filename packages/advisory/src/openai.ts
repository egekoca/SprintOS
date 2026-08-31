type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

interface OpenAIResponseBody {
  status?: string;
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
    const message = body?.error?.message ?? (bodyText.trim() || `HTTP ${response.status}`);
    throw new Error(`OpenAI request failed (HTTP ${response.status}): ${message}`);
  }

  if (!body) {
    throw new Error("OpenAI returned a non-JSON response.");
  }

  if (body.status && body.status !== "completed") {
    const message = body.error?.message ?? `status ${body.status}`;
    throw new Error(`OpenAI response did not complete: ${message}`);
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
