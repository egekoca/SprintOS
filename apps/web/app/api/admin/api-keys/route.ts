import { NextResponse } from "next/server";
import { generateApiKey, hashApiKey } from "@/lib/api-keys";
import { ApiKeyRecord, StoreUnavailableError, store } from "@/lib/store";
import { requestBodyIsTooLarge } from "@/lib/request-security";

/**
 * Mint one Review API key.
 *
 * Deliberately not self-serve: a partner integration like StelHacks gets a
 * key handed to it after a real conversation, not through a public signup
 * form this deployment would then have to police on its own. Guarded by a
 * server-only secret that never reaches a browser.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.SPRINTOS_ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "This deployment has no admin secret configured." }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (requestBodyIsTooLarge(request)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  let body: { label?: unknown; rate_limit_per_hour?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label || label.length > 100) {
    return NextResponse.json({ error: "Send a label up to 100 characters, naming who this key is for." }, { status: 400 });
  }

  const key = generateApiKey();
  const record = ApiKeyRecord.parse({
    key_hash: hashApiKey(key),
    label,
    created_at: new Date().toISOString(),
    ...(body.rate_limit_per_hour !== undefined ? { rate_limit_per_hour: body.rate_limit_per_hour } : {}),
  });

  try {
    await store.putApiKey(record);
    // The only response that ever carries the raw key. Lost means re-minted.
    return NextResponse.json({ key, label, rate_limit_per_hour: record.rate_limit_per_hour });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: "The key could not be stored." }, { status: 500 });
  }
}
