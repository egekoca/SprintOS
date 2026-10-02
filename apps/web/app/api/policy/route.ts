import { NextResponse } from "next/server";
import { ApprovalPolicy } from "@sprintos/schemas";
import { StoreUnavailableError, store, validateEngagementId } from "@/lib/store";
import { takeRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, requestBodyIsTooLarge, requestClientKey } from "@/lib/request-security";
import { engagementRoles } from "@/lib/stellar/engagement-roles.server";

/**
 * The multi-reviewer approval threshold for one engagement.
 *
 * Only the sponsor may set it, and only to a number of reviewers the contract
 * has itself already authorised — this document can only make release harder
 * to reach than the contract's own default (any one authorized reviewer
 * decides alone), never easier. See `packages/schemas/src/attestation.ts`.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  const engagementId = new URL(request.url).searchParams.get("engagement_id");
  if (!engagementId) {
    return NextResponse.json({ error: "Send the engagement id." }, { status: 400 });
  }
  try {
    validateEngagementId(engagementId);
    const policy = await store.getPolicy(engagementId);
    return NextResponse.json({ threshold: policy?.threshold ?? 1 });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Invalid engagement id." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  }
  if (requestBodyIsTooLarge(request)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }
  if (!takeRateLimit(`policy:${requestClientKey(request)}`, 20).allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  let body: { engagement_id?: unknown; threshold?: unknown; sponsor?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const engagementId = typeof body.engagement_id === "string" ? body.engagement_id : "";
  try {
    validateEngagementId(engagementId);
  } catch {
    return NextResponse.json({ error: "Invalid engagement id." }, { status: 400 });
  }

  const roles = await engagementRoles(engagementId);
  if (!roles) {
    return NextResponse.json({ error: "That engagement could not be read from the network." }, { status: 409 });
  }
  if (body.sponsor !== roles.sponsor) {
    return NextResponse.json({ error: "Only the sponsor may set the approval threshold." }, { status: 403 });
  }

  const maxThreshold = Math.max(1, roles.reviewers.length || 1);
  const threshold = Number(body.threshold);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > Math.min(3, maxThreshold)) {
    return NextResponse.json(
      { error: `Threshold must be a whole number between 1 and ${Math.min(3, maxThreshold)}.` },
      { status: 400 },
    );
  }

  const policy = ApprovalPolicy.parse({
    schema_version: "1.0.0",
    engagement_id: engagementId,
    threshold,
  });

  try {
    await store.putPolicy(policy);
    return NextResponse.json({ threshold: policy.threshold });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: "The policy could not be stored." }, { status: 500 });
  }
}
