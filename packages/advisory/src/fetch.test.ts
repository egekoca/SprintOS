import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicIp, parseGitHubUrl } from "./fetch.ts";

test("a repository URL parses", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/egekoca/SprintOS"), {
    owner: "egekoca",
    repo: "SprintOS",
    kind: "repo",
  });
});

test("a commit URL parses with its ref", () => {
  const t = parseGitHubUrl("https://github.com/egekoca/SprintOS/commit/abc123");
  assert.equal(t?.kind, "commit");
  assert.equal(t?.ref, "abc123");
});

test("a pull request URL parses with its number", () => {
  const t = parseGitHubUrl("https://github.com/egekoca/SprintOS/pull/7");
  assert.equal(t?.kind, "pull");
  assert.equal(t?.ref, "7");
});

test("non-GitHub URLs fall through to the page fetcher", () => {
  assert.equal(parseGitHubUrl("https://docs.example.com/guide"), null);
  assert.equal(parseGitHubUrl("not a url"), null);
});

test("a GitHub URL without a repository is not a target", () => {
  assert.equal(parseGitHubUrl("https://github.com/egekoca"), null);
});

test("private, loopback, link-local and documentation IPs are blocked", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fc00::1", "203.0.113.10"]) {
    assert.equal(isPublicIp(address), false, address);
  }
});

test("public IPs remain fetchable", () => {
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("2606:4700:4700::1111"), true);
});

/* A builder who opens a file on github.com and copies the address bar gets a
   `blob` URL. That used to fall through to "some repository", and the model was
   handed a star count where it had asked for a source file. */
test("a file link is recognised as a file, not as its repository", () => {
  const target = parseGitHubUrl("https://github.com/egekoca/ShipYard402/blob/main/contracts/src/Registry.sol");
  assert.equal(target?.kind, "file");
  assert.equal(target?.ref, "main");
  assert.equal(target?.path, "contracts/src/Registry.sol");
});

test("a directory link is recognised as a directory", () => {
  const target = parseGitHubUrl("https://github.com/egekoca/ShipYard402/tree/main/contracts/test");
  assert.equal(target?.kind, "dir");
  assert.equal(target?.path, "contracts/test");
});

test("a nested path keeps every segment", () => {
  const target = parseGitHubUrl("https://github.com/o/r/blob/main/a/b/c/d.ts");
  assert.equal(target?.path, "a/b/c/d.ts");
});

test("a branch name with a slash still resolves to a path", () => {
  const target = parseGitHubUrl("https://github.com/o/r/blob/main/docs/evidence/run-2026-08-06.md");
  assert.equal(target?.kind, "file");
  assert.equal(target?.path, "docs/evidence/run-2026-08-06.md");
});

/* A tree URL with nothing after the branch is the repository root, and the
   repository summary is the right answer for it. */
test("a branch root is treated as the repository", () => {
  assert.equal(parseGitHubUrl("https://github.com/o/r/tree/main")?.kind, "repo");
  assert.equal(parseGitHubUrl("https://github.com/o/r")?.kind, "repo");
});

test("commit and pull links are unchanged", () => {
  assert.equal(parseGitHubUrl("https://github.com/o/r/commit/abc123")?.kind, "commit");
  assert.equal(parseGitHubUrl("https://github.com/o/r/pull/42")?.kind, "pull");
});

test("an encoded path segment is decoded once", () => {
  const target = parseGitHubUrl("https://github.com/o/r/blob/main/docs/my%20file.md");
  assert.equal(target?.path, "docs/my file.md");
});

test("a link to something else on github is still not a file", () => {
  assert.equal(parseGitHubUrl("https://github.com/o/r/issues/3")?.kind, "other");
  assert.equal(parseGitHubUrl("https://example.com/o/r/blob/main/x.ts"), null);
});
