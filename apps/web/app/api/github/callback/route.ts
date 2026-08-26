import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  encryptGitHubSession,
  GITHUB_OAUTH_STATE_COOKIE,
  GITHUB_SESSION_COOKIE,
  GITHUB_SESSION_MAX_AGE,
  githubCallbackUrl,
  githubOAuthConfigured,
  oauthStateMatches,
  safeReturnPath,
  secureCookie,
} from "@/lib/github-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GitHubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUserResponse {
  login: string;
  name: string | null;
  avatar_url: string;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  if (!githubOAuthConfigured()) return redirectWithError(request, "/sponsor", "not-configured");

  const code = requestUrl.searchParams.get("code");
  const receivedState = requestUrl.searchParams.get("state") ?? "";
  const jar = await cookies();
  const cookie = jar.get(GITHUB_OAUTH_STATE_COOKIE)?.value;

  let stateData: { state: string; returnTo: string } | null = null;
  try {
    stateData = cookie ? JSON.parse(cookie) as { state: string; returnTo: string } : null;
  } catch {
    stateData = null;
  }

  if (!code || !stateData || !oauthStateMatches(stateData.state, receivedState)) {
    return redirectWithError(request, safeReturnPath(stateData?.returnTo ?? null), "state");
  }

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: githubCallbackUrl(request),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const token = await tokenResponse.json() as GitHubTokenResponse;
    if (!tokenResponse.ok || !token.access_token) throw new Error(token.error_description ?? token.error ?? "Token exchange failed.");

    const userResponse = await fetch("https://api.github.com/user", {
      headers: githubHeaders(token.access_token),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!userResponse.ok) throw new Error("GitHub user profile could not be loaded.");
    const user = await userResponse.json() as GitHubUserResponse;

    const destination = new URL(safeReturnPath(stateData.returnTo), request.url);
    destination.searchParams.set("github", "connected");
    const response = NextResponse.redirect(destination);
    clearStateCookie(response);
    response.cookies.set(GITHUB_SESSION_COOKIE, encryptGitHubSession({
      accessToken: token.access_token,
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      expiresAt: Date.now() + GITHUB_SESSION_MAX_AGE * 1000,
    }), {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie(request),
      path: "/",
      maxAge: GITHUB_SESSION_MAX_AGE,
    });
    return response;
  } catch {
    return redirectWithError(request, safeReturnPath(stateData.returnTo), "oauth");
  }
}

function redirectWithError(request: Request, path: string, error: string) {
  const destination = new URL(path, request.url);
  destination.searchParams.set("github", error);
  const response = NextResponse.redirect(destination);
  clearStateCookie(response);
  return response;
}

function clearStateCookie(response: NextResponse) {
  response.cookies.set(GITHUB_OAUTH_STATE_COOKIE, "", { path: "/api/github", maxAge: 0 });
}

function githubHeaders(token: string): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "SprintOS",
    "x-github-api-version": "2026-03-10",
  };
}
