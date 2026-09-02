import { expect, test } from "@playwright/test";

/**
 * The pages an Ambassador Chapter Lead opens, in a real browser.
 *
 * The unit tests already cover the rules. What they cannot tell you is whether
 * the page that renders them actually loads on a deployment — and a reviewer
 * who hits a 500 on `/evidence` has learned something worse about the project
 * than any passing test can undo.
 */

test.describe("landing", () => {
  test("the landing page states what the product does", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/SprintOS/i);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    /* The one claim the whole project rests on has to survive a redesign. */
    await expect(page.getByText(/SprintOS advises/i).first()).toBeVisible();
  });

  /* The landing page is marketing chrome and links onward to two places: the
     app, and the evidence pack. The reference docs live behind the app header,
     which is where someone who is actually using it will look. */
  test("a reviewer can reach the evidence pack and the app from the landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href="/evidence"]').first()).toBeAttached();
    await expect(page.locator('a[href="/app"]').first()).toBeAttached();
  });

  test("the docs are one click away once inside the app", async ({ page }) => {
    await page.goto("/e/2");
    await expect(page.locator('a[href="/docs"]').first()).toBeAttached({ timeout: 30_000 });
  });
});

test.describe("the evidence pack", () => {
  test("the pack renders all three deliverables", async ({ page }) => {
    await page.goto("/evidence");
    await expect(page.getByRole("heading", { name: /Evidence pack/i })).toBeVisible();
    for (const deliverable of [/Deliverable 1/i, /Deliverable 2/i, /Deliverable 3/i]) {
      await expect(page.getByRole("heading", { name: deliverable })).toBeVisible();
    }
  });

  /* An evidence pack that hides its own gaps is worth less than one that names
     them, so the outstanding items must be on the page, not omitted from it. */
  test("outstanding work is shown rather than quietly dropped", async ({ page }) => {
    await page.goto("/evidence");
    await expect(page.getByText(/outstanding/i).first()).toBeVisible();
  });

  test("the three sample report hashes are printed in full", async ({ page }) => {
    await page.goto("/evidence");
    const body = await page.locator("body").innerText();
    const hashes = body.match(/sha256:[0-9a-f]{64}/g) ?? [];
    expect(hashes.length).toBeGreaterThanOrEqual(3);
  });
});

test.describe("the AI boundary proof", () => {
  test("the page makes the claim in its own words", async ({ page }) => {
    await page.goto("/evidence/ai-boundary");
    await expect(page.getByRole("heading", { name: /AI cannot move money/i })).toBeVisible();
  });

  /* These three facts are the proof. If a redesign loses one of them the page
     still looks fine and no longer demonstrates anything. */
  test("the 100/100 vector, the non-binding flag and the absent transaction are all stated", async ({ page }) => {
    await page.goto("/evidence/ai-boundary");
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/100\s*\/\s*100/);
    expect(body).toMatch(/binding/i);
    expect(body).toMatch(/none/i);
  });

  test("the rejected-attempt table is present", async ({ page }) => {
    await page.goto("/evidence/ai-boundary");
    await expect(page.getByText(/Rejected/i).first()).toBeVisible();
  });
});

test.describe("public engagement records", () => {
  /* #2 ends in Released after a human approval, #3 in Refunded after a Hold.
     Between them they are the SOW's "one approval and release scenario and one
     Hold or refund scenario", and they are read live from the ledger. */
  test("engagement #2 shows the approval and release path", async ({ page }) => {
    await page.goto("/e/2");
    await expect(page.getByRole("heading", { name: /Engagement #2/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/paid to builder/i).first()).toBeVisible();
    await expect(page.getByText(/settled/i).first()).toBeVisible();
  });

  /* The interface says "reclaimed" where the contract says Refunded, because
     that is what happened in plain words. Assert the money, not the wording:
     nothing was paid to the builder and the full amount went back. */
  test("engagement #3 shows the hold and refund path", async ({ page }) => {
    await page.goto("/e/3");
    await expect(page.getByRole("heading", { name: /Engagement #3/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/reclaimed by sponsor/i).first()).toBeVisible();
    await expect(page.getByText(/paid to builder/i).first()).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).toMatch(/PAID TO BUILDER\s*\n?\s*0 USDC/i);
    expect(body).toMatch(/RECLAIMED BY SPONSOR\s*\n?\s*25 USDC/i);
  });

  test("a public record links out to the ledger rather than asking to be believed", async ({ page }) => {
    await page.goto("/e/2");
    await expect(page.getByRole("heading", { name: /Engagement #2/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('a[href*="stellar.expert"]').first()).toBeVisible();
  });

  test("an engagement that does not exist says so instead of breaking", async ({ page }) => {
    await page.goto("/e/99999");
    await expect(page.getByRole("heading", { name: /Not found|Could not read the ledger/i }))
      .toBeVisible({ timeout: 30_000 });
  });
});

test.describe("documentation", () => {
  test("the docs page covers the roles, the AI boundary and how to reproduce it", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { name: /One engagement, three roles/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /The AI is outside the money path/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Reproduce the claims/i })).toBeVisible();
  });
});

test.describe("readiness", () => {
  test("health reports what is configured and leaks no secret", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.network).toBe("testnet");
    expect(body.settlement_contract.configured).toBe(true);
    expect(body.settlement_asset.configured).toBe(true);

    /* The runbook has this screenshotted as evidence, so it must stay safe to
       put in front of people. */
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/sk-|vercel_blob_rw_|BLOB_READ_WRITE_TOKEN|SECRET/i);
    expect(raw).not.toMatch(/\bS[A-Z2-7]{55}\b/);
  });
});
