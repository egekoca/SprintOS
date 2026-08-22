import { NextResponse } from "next/server";
import { CriteriaDocument, documentHash } from "@sprintos/schemas";
import { store } from "@/lib/store";
import { takeRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, requestBodyIsTooLarge, requestClientKey } from "@/lib/request-security";

/**
 * Store an acceptance-criteria document and return its hash.
 *
 * The hash is what the sponsor anchors on chain. The prose stays here, and the
 * reviewer screen later recomputes this hash to prove the criteria it is
 * showing are the ones that were funded.
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
    const doc = CriteriaDocument.parse(await request.json());
    const hash = await store.putCriteria(doc);
    return NextResponse.json({ hash });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid criteria document." },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hash = url.searchParams.get("hash");
  if (!hash) {
    return NextResponse.json({ error: "Send the criteria hash anchored on chain." }, { status: 400 });
  }
  try {
    const criteria = await store.getCriteria(hash);
    return NextResponse.json({
      criteria,
      hash: criteria ? documentHash(criteria) : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid criteria hash." },
      { status: 400 },
    );
  }
}
