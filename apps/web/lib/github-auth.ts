import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const GITHUB_SESSION_COOKIE = "sprintos_github_session";
export const GITHUB_OAUTH_STATE_COOKIE = "sprintos_github_oauth_state";
export const GITHUB_SESSION_MAX_AGE = 60 * 60 * 8;

export interface GitHubSession {
  accessToken: string;
  login: string;
  name: string | null;
  avatarUrl: string;
  expiresAt: number;
}

export function githubOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID
    && process.env.GITHUB_CLIENT_SECRET
    && process.env.GITHUB_SESSION_SECRET,
  );
}

function sessionKey(): Buffer {
  const secret = process.env.GITHUB_SESSION_SECRET;
  if (!secret) throw new Error("GITHUB_SESSION_SECRET is not configured.");
  return createHash("sha256").update(secret).digest();
}

export function encryptGitHubSession(session: GitHubSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function decryptGitHubSession(value: string | undefined): GitHubSession | null {
  if (!value || !process.env.GITHUB_SESSION_SECRET) return null;
  try {
    const payload = Buffer.from(value, "base64url");
    if (payload.length < 29) return null;
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", sessionKey(), iv);
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")) as GitHubSession;
    if (!parsed.accessToken || !parsed.login || parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function safeReturnPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/sponsor";
}

export function oauthStateMatches(expected: string, received: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function githubCallbackUrl(request: Request): string {
  return process.env.GITHUB_CALLBACK_URL ?? new URL("/api/github/callback", request.url).toString();
}

export function secureCookie(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}
