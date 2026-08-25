import assert from "node:assert/strict";
import test from "node:test";
import { parseGitHubRepository } from "./github.ts";

test("GitHub repository URLs are normalized", () => {
  assert.deepEqual(parseGitHubRepository("https://github.com/openai/openai-node.git"), {
    owner: "openai",
    repo: "openai-node",
  });
});

test("owner/repo shorthand is accepted", () => {
  assert.deepEqual(parseGitHubRepository("stellar/js-stellar-sdk"), {
    owner: "stellar",
    repo: "js-stellar-sdk",
  });
});

test("non-GitHub and nested URLs are rejected", () => {
  assert.throws(() => parseGitHubRepository("https://example.com/openai/openai-node"));
  assert.throws(() => parseGitHubRepository("https://github.com/openai/openai-node/issues"));
});
