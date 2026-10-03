import { NextResponse } from "next/server";
import { z } from "zod";
import { AdvisoryUnavailableError, ReportValidationError, generateReport } from "@sprintos/advisory";
import { AcceptanceCriterion, EvidenceLink, MAX_CRITERIA, MAX_EVIDENCE } from "@sprintos/schemas/milestone";
import { hashApiKey } from "@/lib/api-keys";
import { StoreUnavailableError, store } from "@/lib/store";
import { acquireJobLock, releaseJobLock, takeRateLimit } from "@/lib/rate-limit";
import { requestBodyIsTooLarge } from "@/lib/request-security";

/**
 * The public Review API.
 *
 * For a platform that is not a SprintOS engagement at all — a hackathon
 * judging a submission against a fixed rubric is the same shape of problem
 * as milestone review, without an escrow contract behind it. This wraps the
 * same advisory pipeline `/api/advisory` uses, with the same guarantee: the
 * response is a score, a checklist and a recommendation, never a decision.
 * Nothing this route returns can approve, pay, or rank anyone out — a human
 * at the calling platform reads it the way a SprintOS reviewer does.
 *
 * Authenticated by a bearer API key minted through `/api/admin/api-keys`,
 * not the same-origin check the rest of this app's writes use — the entire
 * point of this route is to be called from somewhere else.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEEP_REVIEW_OPTIONS = { reasoningEffort: "medium" as const, maxOutputTokens: 6_000 };

const Body = z.object({
  title: z.string().min(1).max(200),
  outcome: z.string().min(1).max(500).optional(),
  criteria: z.array(AcceptanceCriterion).min(1).max(MAX_CRITERIA),
  evidence_links: z.array(EvidenceLink).min(1).max(MAX_EVIDENCE),
  note: z.string().max(2000).optional(),
  kind: z.enum(["standard", "deep"]).default("standard"),
});

async function authenticate(request: Request): Promise<{ label: string } | null> {
  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer (sk_[0-9a-f]+)$/);
  const presented = match?.[1];
  if (!presented) return null;
  const record = await store.getApiKey(hashApiKey(presented));
  return record ? { label: record.label } : null;
}

export async function POST(request: Request) {
  if (requestBodyIsTooLarge(request)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  let caller: { label: string } | null;
  try {
    caller = await authenticate(request);
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
  if (!caller) {
    return NextResponse.json({ error: "Send a valid Review API key as a Bearer token." }, { status: 401 });
  }

  const rate = takeRateLimit(`review-api:${caller.label}`, 20, 60 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests for this key this hour." },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", issues: parsed.error.issues }, { status: 400 });
  }
  const { title, outcome, criteria, evidence_links, note, kind } = parsed.data;

  /* A job lock per caller rather than per submission: this route has no
     notion of "milestone version" to key on, and one caller double-firing a
     request is exactly the case the lock exists to stop. */
  const jobKey = `review-api-job:${caller.label}`;
  if (!acquireJobLock(jobKey)) {
    return NextResponse.json({ error: "A review is already running for this key. Wait for it to finish." }, { status: 409 });
  }

  try {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return NextResponse.json({ error: "This deployment has no advisory service configured." }, { status: 503 });
    }

    const report = await generateReport({
      criteria: {
        schema_version: "1.0.0",
        engagement_id: "0",
        milestone_idx: 0,
        title,
        ...(outcome ? { outcome } : {}),
        criteria,
      },
      evidence: {
        schema_version: "1.0.0",
        engagement_id: "0",
        milestone_idx: 0,
        submitted_at: new Date().toISOString(),
        ...(note ? { note } : {}),
        links: evidence_links,
      },
      ...(kind === "deep" ? DEEP_REVIEW_OPTIONS : {}),
    });
    return NextResponse.json({ report });
  } catch (err) {
    if (err instanceof ReportValidationError) {
      return NextResponse.json({ error: "The generated report failed validation.", problems: err.problems }, { status: 422 });
    }
    if (err instanceof AdvisoryUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: "The review could not be produced." }, { status: 500 });
  } finally {
    releaseJobLock(jobKey);
  }
}
