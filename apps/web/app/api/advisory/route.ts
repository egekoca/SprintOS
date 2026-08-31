import { NextResponse } from "next/server";
import { z } from "zod";
import { AdvisoryUnavailableError, generateReport, verifyReportHash } from "@sprintos/advisory";
import { ReportValidationError } from "@sprintos/advisory";
import { StoreUnavailableError, store } from "@/lib/store";
import { takeRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, requestBodyIsTooLarge, requestClientKey } from "@/lib/request-security";

/**
 * The advisory endpoint.
 *
 * Runs only when a reviewer asks for it. There is no cron, no webhook, and no
 * background worker in this project that could call it on its own.
 *
 * Note what this route does *not* import: no Stellar SDK, no wallet, no
 * signing. It reads two documents, calls a model, stores a report, and returns
 * it. It cannot change a milestone's status, because the only thing that can is
 * a signed transaction from a human.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  engagement_id: z.string().regex(/^(0|[1-9]\d*)$/),
  milestone_idx: z.number().int().min(0).max(2),
  criteria_hash: z.string().regex(/^(?:sha256:)?[0-9a-f]{64}$/i),
  evidence_hash: z.string().regex(/^(?:sha256:)?[0-9a-f]{64}$/i),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin report generation is not allowed." }, { status: 403 });
  }

  if (requestBodyIsTooLarge(request)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  const rate = takeRateLimit(`advisory:${requestClientKey(request)}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many advisory requests. Try again later." },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }

  let parsed;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Send an engagement_id and a milestone_idx." },
      { status: 400 },
    );
  }

  const { engagement_id, milestone_idx, criteria_hash, evidence_hash } = parsed;

  const [criteria, evidence] = await Promise.all([
    store.getCriteria(criteria_hash),
    store.getEvidence(evidence_hash),
  ]);

  if (!criteria) {
    return NextResponse.json(
      { error: "No acceptance criteria are recorded for this milestone." },
      { status: 404 },
    );
  }
  if (!evidence) {
    return NextResponse.json(
      { error: "The builder has not submitted evidence for this milestone yet." },
      { status: 404 },
    );
  }
  if (criteria.milestone_idx !== milestone_idx) {
    return NextResponse.json({ error: "The criteria hash belongs to another milestone." }, { status: 409 });
  }
  if (evidence.engagement_id !== engagement_id || evidence.milestone_idx !== milestone_idx) {
    return NextResponse.json({ error: "The evidence hash belongs to another engagement or milestone." }, { status: 409 });
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    // Answered as a normal condition rather than a 500: a reviewer with no
    // advisory service still has a working review screen, and the message says
    // so plainly instead of looking like a crash.
    return NextResponse.json(
      {
        error:
          "The OpenAI advisory service is not configured on this deployment. You can still review the evidence and decide — the report is advisory only.",
        advisory_available: false,
      },
      { status: 503 },
    );
  }

  try {
    const report = await generateReport({ criteria, evidence });
    await store.putReport(report, evidence_hash);
    return NextResponse.json({ report });
  } catch (err) {
    if (err instanceof ReportValidationError) {
      return NextResponse.json(
        {
          error: "The generated report failed validation and was discarded.",
          problems: err.problems,
          advisory_available: true,
        },
        { status: 422 },
      );
    }
    if (err instanceof AdvisoryUnavailableError) {
      return NextResponse.json(
        { error: err.message, advisory_available: false },
        { status: 503 },
      );
    }
    if (err instanceof StoreUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "The advisory report could not be produced. You can still decide without it." },
      { status: 500 },
    );
  }
}

/** Fetch a stored report without regenerating it. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = z.object({
    engagement_id: z.string().regex(/^(0|[1-9]\d*)$/),
    milestone_idx: z.coerce.number().int().min(0).max(2),
    evidence_hash: z.string().regex(/^(?:sha256:)?[0-9a-f]{64}$/i),
  }).safeParse(Object.fromEntries(url.searchParams));

  if (!parsed.success) {
    return NextResponse.json({ error: "Send a valid engagement id, milestone index, and evidence hash." }, { status: 400 });
  }

  const { engagement_id, milestone_idx, evidence_hash } = parsed.data;
  const report = await store.getReport(engagement_id, milestone_idx, evidence_hash);
  return NextResponse.json({ report: report && verifyReportHash(report) ? report : null });
}
