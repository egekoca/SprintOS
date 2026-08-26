import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptGitHubSession,
  encryptGitHubSession,
  oauthStateMatches,
  safeReturnPath,
} from "./github-auth.ts";

test("GitHub sessions are encrypted and authenticated", () => {
  const previous = process.env.GITHUB_SESSION_SECRET;
  process.env.GITHUB_SESSION_SECRET = "test-secret-that-is-long-enough-for-session-encryption";
  try {
    const session = {
      accessToken: "github-token-that-must-not-appear-in-plaintext",
      login: "sprintos",
      name: "SprintOS",
      avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
      expiresAt: Date.now() + 60_000,
    };
    const encrypted = encryptGitHubSession(session);
    assert.equal(encrypted.includes(session.accessToken), false);
    assert.deepEqual(decryptGitHubSession(encrypted), session);
    assert.equal(decryptGitHubSession(`${encrypted.slice(0, -1)}x`), null);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_SESSION_SECRET;
    else process.env.GITHUB_SESSION_SECRET = previous;
  }
});

test("OAuth return paths stay on SprintOS", () => {
  assert.equal(safeReturnPath("/sponsor?draft=1"), "/sponsor?draft=1");
  assert.equal(safeReturnPath("//attacker.example"), "/sponsor");
  assert.equal(safeReturnPath("https://attacker.example"), "/sponsor");
  assert.equal(oauthStateMatches("same-state", "same-state"), true);
  assert.equal(oauthStateMatches("same-state", "other-state"), false);
});
