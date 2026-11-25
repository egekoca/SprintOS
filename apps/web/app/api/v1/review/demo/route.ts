import { NextResponse } from "next/server";
import { buildDemoReport } from "@sprintos/advisory";
import { takeRateLimit } from "@/lib/rate-limit";

/**
 * The Review API's keyless demo.
 *
 * No Bearer token, no wallet, no account — a single `curl` against this
 * endpoint shows exactly the report shape `POST /api/v1/review` returns for
 * the example request in `docs/REVIEW-API.md`, generated from the same fixed
 * draft every time rather than a live model call, so it is free to call, safe
 * to call often, and checkable: `pnpm --filter @sprintos/advisory fixtures`
 * regenerates the identical JSON, hash included.
 *
 * Still rate limited, per caller IP rather than per API key since there is no
 * key here — this is a demo, not a load-bearing integration point.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rate = takeRateLimit(`review-api-demo:${ip}`, 30, 60 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. This is a static demo sample — see POST /api/v1/review for real use." },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }

  return NextResponse.json({ report: buildDemoReport() });
}
