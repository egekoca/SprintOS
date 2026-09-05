import { NextResponse } from "next/server";
import { Project, StoreUnavailableError, store, validateEngagementId } from "@/lib/store";
import { takeRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, requestBodyIsTooLarge, requestClientKey } from "@/lib/request-security";
import { parseGitHubRepository } from "@/lib/github";

/**
 * The repository an engagement's milestones are judged against.
 *
 * Written once, when the sponsor signs the engagement into existence. They
 * already named it in the first step of setup; asking again on the detail page
 * was the wrong answer to "the contract does not store this".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const engagementId = new URL(request.url).searchParams.get("engagement_id") ?? "";
  try {
    validateEngagementId(engagementId);
  } catch {
    return NextResponse.json({ error: "Invalid engagement id." }, { status: 400 });
  }
  try {
    return NextResponse.json({ project: await store.getProject(engagementId) });
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      return NextResponse.json({ error: "The document store is not reachable." }, { status: 503 });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  }
  if (requestBodyIsTooLarge(request)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }
  if (!takeRateLimit(`project:${requestClientKey(request)}`, 30).allowed) {
    return NextResponse.json({ error: "Too many writes. Try again later." }, { status: 429 });
  }

  const parsed = Project.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Send an engagement_id and a repository." }, { status: 400 });
  }

  /* Normalised so the detail page and the progress check always see the same
     shape, whatever the sponsor pasted. */
  let repository: string;
  try {
    const { owner, repo } = parseGitHubRepository(parsed.data.repository);
    repository = `https://github.com/${owner}/${repo}`;
  } catch {
    return NextResponse.json({ error: "That is not a public GitHub repository." }, { status: 400 });
  }

  try {
    await store.putProject({ engagement_id: parsed.data.engagement_id, repository });
    return NextResponse.json({ repository });
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}
