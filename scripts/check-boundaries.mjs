#!/usr/bin/env node
/**
 * Enforce the security boundary that SprintOS claims.
 *
 * The project's central promise is that the advisory module cannot move funds.
 * A promise in a README is worth very little; this script turns it into a build
 * failure. It checks that the advisory module and the shared schemas:
 *
 *   1. do not depend on any Stellar SDK, and
 *   2. contain no signing or key-handling code.
 *
 * If someone later adds `@stellar/stellar-sdk` to the advisory package —
 * innocently, to "just read a balance" — CI stops them. That is the difference
 * between a documented boundary and an enforced one.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");

/** Packages that must never be able to sign a Stellar transaction. */
const SEALED = ["packages/advisory", "packages/schemas"];

const FORBIDDEN_DEPS = [
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
const FORBIDDEN_PATTERNS = [
  { re: /\bKeypair\b/, why: "constructs a Stellar keypair" },
  { re: /\bSECRET_KEY\b|\bsecretKey\b/, why: "references a secret key" },
  { re: /\bsignTransaction\b|\bsignAuthEntry\b/, why: "signs a transaction or auth entry" },
  { re: /\bS[A-Z2-7]{55}\b/, why: "contains something shaped like a Stellar secret seed" },
  { re: /\bTransactionBuilder\b/, why: "builds a Stellar transaction" },
];

const problems = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "fixtures" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

for (const pkg of SEALED) {
  const pkgDir = join(root, pkg);

  // 1 — dependency manifest
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

  // 2 — source
  for (const file of walk(join(pkgDir, "src"))) {
    const source = readFileSync(file, "utf8");
    const where = relative(root, file);

    for (const forbidden of FORBIDDEN_DEPS) {
      if (source.includes(`"${forbidden}"`) || source.includes(`'${forbidden}'`)) {
        problems.push(`${where} imports ${forbidden}.`);
      }
    }
    for (const { re, why } of FORBIDDEN_PATTERNS) {
      // Skip the line if it is a comment explaining the rule rather than breaking it.
      const lines = source.split("\n");
      lines.forEach((line, i) => {
        if (!re.test(line)) return;
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        problems.push(`${where}:${i + 1} ${why}.`);
      });
    }
  }
}

if (problems.length > 0) {
  console.error("\n✗ Security boundary violated\n");
  for (const p of problems) console.error(`  · ${p}`);
  console.error(
    "\nThe advisory module must have no way to sign a Stellar transaction.\n" +
      "This is the guarantee the whole project rests on — see docs/SECURITY.md.\n",
  );
  process.exit(1);
}

console.log("✓ Security boundary intact");
console.log(`  ${SEALED.join(", ")} carry no Stellar SDK and no signing code.`);
