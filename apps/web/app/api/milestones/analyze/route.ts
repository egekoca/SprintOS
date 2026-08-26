import { NextResponse } from "next/server";
import { z } from "zod";
import { fallbackMilestonePlan, generateMilestonePlan } from "@sprintos/advisory";
import { isSameOrigin, requestBodyIsTooLarge, requestClientKey } from "@/lib/request-security";
import { takeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  brief: z.string().trim().min(30).max(20_000),
  repository: z.string().max(250).optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin planning is not allowed." }, { status: 403 });
  if (requestBodyIsTooLarge(request, 30_000)) return NextResponse.json({ error: "The project brief is too large." }, { status: 413 });

  const rate = takeRateLimit(`milestone-plan:${requestClientKey(request)}`, 8, 10 * 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many planning requests. Try again shortly." }, { status: 429 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add at least a short project brief before generating milestones." }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      plan: fallbackMilestonePlan(parsed.data.brief, today),
      mode: "structured",
      notice: "AI is not configured locally, so SprintOS created an editable structured draft.",
    });
  }

  try {
    const plan = await generateMilestonePlan({ ...parsed.data, today });
    return NextResponse.json({ plan, mode: "ai" });
  } catch {
    return NextResponse.json({ error: "The AI could not create a plan. Your brief is still here; try again or continue manually." }, { status: 502 });
  }
}
