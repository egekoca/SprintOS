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
