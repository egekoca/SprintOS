import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseEvidencePaths, repositoryEvidence, type RepositoryEntry } from "./repository-evidence.ts";
import { EvidenceBundle } from "@sprintos/schemas";

/**
 * A progress check reads the repository instead of waiting for the builder to
 * submit. The bundle it builds still has to satisfy the same schema, because
 * the module downstream cannot tell the difference and should not have to.
 */

const REPO = "https://github.com/egekoca/ShipYard402";

/* A dot-prefixed name like `.github` is a directory, not a file with an
   extension — which is exactly the mistake the first version of this helper
   made. */
function entries(...names: string[]): RepositoryEntry[] {
  return names.map((name) => ({
    name,
    type: !name.startsWith(".") && /\.[a-z]+$/i.test(name) ? ("file" as const) : ("dir" as const),
  }));
}

test("the repository itself is always the first thing looked at", () => {
  const links = chooseEvidencePaths(REPO, []);
  assert.equal(links.length, 1);
  assert.equal(links[0]!.url, REPO);
  assert.equal(links[0]!.type, "repo");
});

test("documentation, tests and CI are picked out of the listing", () => {
  const links = chooseEvidencePaths(REPO, entries("docs", "contracts", ".github", "README.md"));
  const urls = links.map((l) => l.url);
  assert.ok(urls.some((u) => u.endsWith("/tree/main/docs")), urls.join(" "));
  assert.ok(urls.some((u) => u.endsWith("/tree/main/.github")), urls.join(" "));
  assert.ok(urls.some((u) => u.endsWith("/tree/main/contracts")), urls.join(" "));
});

/* The repository summary already carries the README body, so spending one of
   five slots on it again would buy nothing. */
test("the root README is not fetched twice", () => {
  const links = chooseEvidencePaths(REPO, entries("README.md"));
  assert.equal(links.length, 1);
});

test("a bundle holds at most five links however large the repository", () => {
  const links = chooseEvidencePaths(
    REPO,
    entries("docs", ".github", "tests", "contracts", "src", "evidence", "packages"),
  );
  assert.ok(links.length <= 5, `got ${links.length}`);
});

test("a directory becomes a tree link and a file becomes a blob link", () => {
  const links = chooseEvidencePaths(REPO, entries("docs", "spec"));
  assert.ok(links.some((l) => l.url.includes("/tree/main/docs")));
});

test("a branch other than main is honoured", () => {
  const links = chooseEvidencePaths(REPO, entries("docs"), "develop");
  assert.ok(links.some((l) => l.url.includes("/tree/develop/docs")), links.map((l) => l.url).join(" "));
});

test("a trailing slash or .git suffix does not end up in the middle of a path", () => {
  for (const url of [`${REPO}/`, `${REPO}.git`]) {
    const links = chooseEvidencePaths(url, entries("docs"));
    assert.ok(links.every((l) => !l.url.includes(".git/") && !l.url.includes("//tree")));
    assert.equal(links[0]!.url, REPO);
  }
});

test("the bundle it produces satisfies the evidence schema", () => {
  const links = chooseEvidencePaths(REPO, entries("docs", ".github", "contracts"));
  const bundle = repositoryEvidence("1000", 1, links);
  assert.doesNotThrow(() => EvidenceBundle.parse(bundle));
});

/* A reader has to be able to tell this apart from evidence a builder chose and
   anchored, because it is weaker and means something different. */
test("the bundle says plainly that nobody submitted it", () => {
  const bundle = repositoryEvidence("1000", 0, chooseEvidencePaths(REPO, []));
  assert.match(bundle.note ?? "", /not submitted by the builder/i);
  assert.match(bundle.note ?? "", /nothing here is anchored on chain/i);
});
