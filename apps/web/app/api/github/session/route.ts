import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  decryptGitHubSession,
  GITHUB_SESSION_COOKIE,
  githubOAuthConfigured,
} from "@/lib/github-auth";
import { isSameOrigin } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Repository = z.object({
  id: z.number().int(),
  name: z.string(),
  full_name: z.string(),
  html_url: z.string().url(),
  description: z.string().nullable(),
  private: z.boolean(),
  updated_at: z.string(),
  owner: z.object({ login: z.string() }),
});

export async function GET() {
  const jar = await cookies();
  const session = decryptGitHubSession(jar.get(GITHUB_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ configured: githubOAuthConfigured(), connected: false, repositories: [] });
  }

  try {
    const response = await fetch("https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100", {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${session.accessToken}`,
        "user-agent": "SprintOS",
        "x-github-api-version": "2026-03-10",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
    const repositories = z.array(Repository).parse(await response.json()).map((repository) => ({
      id: repository.id,
      owner: repository.owner.login,
      name: repository.name,
      full_name: repository.full_name,
      html_url: repository.html_url,
      description: repository.description,
      private: repository.private,
      updated_at: repository.updated_at,
    }));
    return NextResponse.json({
      configured: true,
      connected: true,
      user: { login: session.login, name: session.name, avatar_url: session.avatarUrl },
      repositories,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ configured: true, connected: false, repositories: [], error: "GitHub session expired. Connect again." }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin sign out is not allowed." }, { status: 403 });
  const response = NextResponse.json({ disconnected: true });
  response.cookies.delete(GITHUB_SESSION_COOKIE);
  return response;
}
