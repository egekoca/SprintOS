#!/usr/bin/env node
/**
 * Enforce the security boundary that SprintOS claims.
 *
 * The project's central promise is that the advisory module cannot move funds.
 * A promise in a README is worth very little; this script turns it into a build
 * failure. It checks that the advisory module, the shared schemas, and — since
 * Month 3 — the public Review API's own surface:
 *
 *   1. do not depend on any Stellar SDK,
 *   2. contain no signing or key-handling code, and
 *   3. — since deep review started reading a submission's actual repository —
 *      contain nothing that could execute what it fetched.
 *
 * If someone later adds `@stellar/stellar-sdk` to the advisory package —
 * innocently, to "just read a balance" — CI stops them. That is the difference
 * between a documented boundary and an enforced one.
 *
 * `checkSealedPackages` and `checkSealedPaths` are exported so the named
 * regression test (`apps/web/app/api/v1/review/route.test.ts`,
 * `test_api_report_cannot_authorize_release`) shares this exact logic rather
 * than re-implementing it — one definition of the boundary, checked from two
 * places.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");

/** Packages that must never be able to sign a Stellar transaction. */
export const SEALED_PACKAGES = ["packages/advisory", "packages/schemas"];

/**
 * Individual files and directories, outside of any sealed package, that
 * together make up the public Review API's reachable surface: the route
 * itself, its demo twin, and every `lib/` module either one imports. Not a
 * whole package — `apps/web` as a whole legitimately depends on the Stellar
 * SDK for wallet flows elsewhere in the app — so these are named
 * individually rather than sealing the app wholesale.
 */
export const SEALED_API_PATHS = [
  "apps/web/app/api/v1",
  "apps/web/lib/api-keys.ts",
  "apps/web/lib/store.ts",
  "apps/web/lib/rate-limit.ts",
  "apps/web/lib/request-security.ts",
];

export const FORBIDDEN_DEPS = [
  "@stellar/stellar-sdk",
  "stellar-sdk",
  "@stellar/freighter-api",
  "@creit.tech/stellar-wallets-kit",
  "@creit-tech/stellar-wallets-kit",
  "stellar-base",
  "soroban-client",
];

/**
 * Patterns that would mean this code handles a key.
 *
 * Kept narrow to stay useful: a rule that fires on the word "sign" would be
 * turned off within a week.
 */
export const FORBIDDEN_PATTERNS = [
  { re: /\bKeypair\b/, why: "constructs a Stellar keypair" },
  { re: /\bSECRET_KEY\b|\bsecretKey\b/, why: "references a secret key" },
  { re: /\bsignTransaction\b|\bsignAuthEntry\b/, why: "signs a transaction or auth entry" },
  { re: /\bS[A-Z2-7]{55}\b/, why: "contains something shaped like a Stellar secret seed" },
  { re: /\bTransactionBuilder\b/, why: "builds a Stellar transaction" },
];

/**
 * Patterns that would mean this code can execute something it fetched.
 *
 * `source.ts` reads a hackathon submission's actual repository — exactly the
 * content a malicious entrant controls — so the same discipline that keeps
 * the advisory package unable to sign a transaction also has to keep it
 * unable to run a line of what it reads. Fetched text stays text, handed to
 * a language model and nothing else.
 */
export const FORBIDDEN_EXECUTION_PATTERNS = [
  { re: /\bchild_process\b/, why: "imports node:child_process" },
  { re: /\bexecSync?\s*\(|\bspawnSync?\s*\(/, why: "executes a shell command" },
  { re: /\beval\s*\(/, why: "calls eval" },
  { re: /new\s+Function\s*\(/, why: "constructs a function from a string" },
  { re: /\bvm\.(Script|createContext|runIn)/, why: "runs code through node:vm" },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "fixtures" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

function checkSource(file, problems) {
  const source = readFileSync(file, "utf8");
  const where = relative(root, file);

  for (const forbidden of FORBIDDEN_DEPS) {
    if (source.includes(`"${forbidden}"`) || source.includes(`'${forbidden}'`)) {
      problems.push(`${where} imports ${forbidden}.`);
    }
  }
  for (const { re, why } of [...FORBIDDEN_PATTERNS, ...FORBIDDEN_EXECUTION_PATTERNS]) {
    // Skip the line if it is a comment explaining the rule rather than breaking it.
    const lines = source.split("\n");
    lines.forEach((line, i) => {
      if (!re.test(line)) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      problems.push(`${where}:${i + 1} ${why}.`);
    });
  }
}

/** Check a workspace package: its declared dependencies and its `src/` tree. */
export function checkSealedPackages(packages = SEALED_PACKAGES) {
  const problems = [];
  for (const pkg of packages) {
    const pkgDir = join(root, pkg);

    const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    const declared = {
      ...(manifest.dependencies ?? {}),
      ...(manifest.devDependencies ?? {}),
      ...(manifest.peerDependencies ?? {}),
    };
    for (const forbidden of FORBIDDEN_DEPS) {
      if (forbidden in declared) {
        problems.push(`${pkg}/package.json declares ${forbidden}. This package must not be able to reach the chain.`);
      }
    }

    for (const file of walk(join(pkgDir, "src"))) checkSource(file, problems);
  }
  return problems;
}

/**
 * Check individual files/directories that are not their own package — no
 * manifest to read, just the source-pattern check, applied to exactly the
 * paths named rather than package.json's `src/` convention.
 */
export function checkSealedPaths(paths = SEALED_API_PATHS) {
  const problems = [];
  for (const path of paths) {
    const full = join(root, path);
    const files = statSync(full).isDirectory() ? walk(full) : [full];
    for (const file of files) checkSource(file, problems);
  }
  return problems;
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  const problems = [...checkSealedPackages(), ...checkSealedPaths()];

  if (problems.length > 0) {
    console.error("\n✗ Security boundary violated\n");
    for (const p of problems) console.error(`  · ${p}`);
    console.error(
      "\nNeither the advisory module nor the public Review API's own surface may have " +
        "a way to sign a Stellar transaction or execute what it fetches.\nThis is the " +
        "guarantee the whole project rests on — see docs/SECURITY.md.\n",
    );
    process.exit(1);
  }

  console.log("✓ Security boundary intact");
  console.log(`  ${SEALED_PACKAGES.join(", ")} carry no Stellar SDK, no signing code, and no execution of fetched content.`);
  console.log(`  ${SEALED_API_PATHS.join(", ")} carry no Stellar SDK and no signing code.`);
}
