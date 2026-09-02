import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  GITHUB_OAUTH_STATE_COOKIE,
  githubCallbackUrl,
  githubOAuthConfigured,
  safeReturnPath,
  secureCookie,
} from "@/lib/github-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!githubOAuthConfigured()) {
    return NextResponse.redirect(new URL("/sponsor?github=not-configured", request.url));
  }

  /* `githubOAuthConfigured` already refused the request without a client id,
     but reading it back through `!` asks the next reader to go and confirm
     that. Narrowing it here says the same thing without the homework. */
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/sponsor?github=not-configured", request.url));
  }

  const requestUrl = new URL(request.url);
  const state = randomBytes(32).toString("base64url");
  const returnTo = safeReturnPath(requestUrl.searchParams.get("returnTo"));
  const authorization = new URL("https://github.com/login/oauth/authorize");
  authorization.searchParams.set("client_id", clientId);
  authorization.searchParams.set("redirect_uri", githubCallbackUrl(request));
  authorization.searchParams.set("scope", "read:user");
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("allow_signup", "true");

  const response = NextResponse.redirect(authorization);
  response.cookies.set(GITHUB_OAUTH_STATE_COOKIE, JSON.stringify({ state, returnTo }), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie(request),
    path: "/api/github",
    maxAge: 10 * 60,
  });
  return response;
}
