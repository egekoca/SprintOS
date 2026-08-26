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
    /* Flip a bit inside the ciphertext rather than swapping the last base64url
       character. Trailing base64 characters carry bits that decoding discards,
       so that edit was sometimes a no-op — the payload came back intact and
       this assertion failed at random. */
    const bytes = Buffer.from(encrypted, "base64url");
    bytes[bytes.length - 1] ^= 0xff;
    assert.equal(decryptGitHubSession(bytes.toString("base64url")), null);

    // Tampering with the authentication tag must be caught too.
    const tagTampered = Buffer.from(encrypted, "base64url");
    tagTampered[14] ^= 0xff;
    assert.equal(decryptGitHubSession(tagTampered.toString("base64url")), null);
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
