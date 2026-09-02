import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for the surfaces a reviewer actually opens.
 *
 * By default these run against a production build started on the spot, so a
 * broken page fails in CI rather than on the Ambassador's screen. Point
 * `SPRINTOS_BASE_URL` at a deployment to run the same suite against the live
 * site — that is worth doing before submitting evidence, because it checks the
 * deployed environment and not just the code.
 *
 *   SPRINTOS_BASE_URL=https://sprintos-ai.vercel.app pnpm e2e
 *
 * Nothing here signs a transaction. A wallet extension cannot be driven from a
 * clean browser profile, and pretending otherwise would produce a test that
 * proves less than it appears to. What these cover is everything a person can
 * reach without a wallet, plus the states the app must show when there isn't
 * one — including the decision buttons staying disabled.
 */

const baseURL = process.env.SPRINTOS_BASE_URL ?? "http://127.0.0.1:3100";
const againstDeployment = Boolean(process.env.SPRINTOS_BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  /* Only start a server when testing this checkout. Against a deployment there
     is nothing to start, and starting one would test the wrong thing. */
  webServer: againstDeployment
    ? undefined
    : {
        command: "pnpm --filter @sprintos/web build && pnpm --filter @sprintos/web start --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
