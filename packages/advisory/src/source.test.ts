import { test } from "node:test";
import assert from "node:assert/strict";
import { isNoise, rankEntries, renderRepositorySource, tierOf } from "./source.ts";

function blob(path: string) {
  return { path, type: "blob" as const };
}

test("isNoise drops dependency directories, build output, and lockfiles", () => {
  assert.equal(isNoise("node_modules/left-pad/index.js"), true);
  assert.equal(isNoise(".git/HEAD"), true);
  assert.equal(isNoise("dist/bundle.js"), true);
  assert.equal(isNoise("target/release/app"), true);
  assert.equal(isNoise("package-lock.json"), true);
  assert.equal(isNoise("Cargo.lock"), true);
  assert.equal(isNoise("logo.png"), true);
  assert.equal(isNoise("src/lib.rs"), false);
  assert.equal(isNoise("README.md"), false);
});

test("tierOf ranks contracts and entry points above tests above everything else", () => {
  assert.equal(tierOf("contracts/settlement/src/lib.rs"), 0);
  assert.equal(tierOf("programs/vault/src/main.rs"), 0);
  assert.equal(tierOf("Cargo.toml"), 0);
  assert.equal(tierOf("tests/happy_path.rs"), 1);
  assert.equal(tierOf("src/utils/format.ts"), 2);
});

test("rankEntries puts contracts first, tests second, drops noise, and is deterministic", () => {
  const entries = [
    blob("src/helpers/format.ts"),
    blob("node_modules/left-pad/index.js"),
    blob("tests/happy_path.rs"),
    blob("contracts/vault/src/lib.rs"),
    blob("README.md"),
    { path: "contracts", type: "tree" as const },
    { path: "deps/vendored", type: "commit" as const },
  ];

  const ranked = rankEntries(entries).map((e) => e.path);
  assert.deepEqual(ranked, [
    "README.md",
    "contracts/vault/src/lib.rs",
    "tests/happy_path.rs",
    "src/helpers/format.ts",
  ]);
});

test("rankEntries prefers shallower paths within the same tier", () => {
  const entries = [blob("contracts/nested/deep/lib.rs"), blob("contracts/lib.rs")];
  assert.deepEqual(rankEntries(entries).map((e) => e.path), ["contracts/lib.rs", "contracts/nested/deep/lib.rs"]);
});

test("renderRepositorySource names what was read and what was not", () => {
  const rendered = renderRepositorySource({
    owner: "egekoca",
    repo: "SprintOS",
    ref: "main",
    files: [{ path: "src/lib.rs", content: "pub fn main() {}" }],
    omitted: ["src/huge.rs"],
    treeTruncated: false,
  });
  assert.match(rendered, /1 file read, 1 not read for space/);
  assert.match(rendered, /--- src\/lib\.rs ---/);
  assert.match(rendered, /pub fn main\(\) \{\}/);
  assert.match(rendered, /src\/huge\.rs/);
});
