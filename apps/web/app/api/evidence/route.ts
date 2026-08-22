import { NextResponse } from "next/server";
import { EvidenceBundle, documentHash } from "@sprintos/schemas";
import { store } from "@/lib/store";
import { takeRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, requestBodyIsTooLarge, requestClientKey } from "@/lib/request-security";

/**
 * Store an evidence bundle and return its hash.
 *
 * The schema refuses non-https links and any URL carrying credentials, so a
 * builder cannot hand the advisory module a token to replay even by accident.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin document writes are not allowed." }, { status: 403 });
  }
  if (requestBodyIsTooLarge(request)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }
  if (!takeRateLimit(`documents:${requestClientKey(request)}`, 30).allowed) {
    return NextResponse.json({ error: "Too many document writes. Try again later." }, { status: 429 });
  }
  try {
    const doc = EvidenceBundle.parse(await request.json());
    const hash = await store.putEvidence(doc);
    return NextResponse.json({ hash });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid evidence bundle." },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hash = url.searchParams.get("hash");
  if (!hash) {
    return NextResponse.json({ error: "Send the evidence hash anchored on chain." }, { status: 400 });
  }
  try {
    const evidence = await store.getEvidence(hash);
    return NextResponse.json({ evidence, hash: evidence ? documentHash(evidence) : null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid evidence hash." },
      { status: 400 },
    );
  }
}
