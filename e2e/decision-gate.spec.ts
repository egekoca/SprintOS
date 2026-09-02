import { expect, test } from "@playwright/test";

/**
 * What the app refuses to do when nobody has signed in.
 *
 * These are the negative cases, and they matter more than the positive ones. A
 * demo can always be made to look right; what a reviewer needs to see is that
 * the screen will not hand a decision to someone who has not proved who they
 * are. The contract enforces this independently — these tests check that the
 * interface does not misrepresent it.
 */

test.describe("the reviewer desk without a wallet", () => {
  test("the desk loads and asks for a wallet rather than showing a decision", async ({ page }) => {
    await page.goto("/review");
    await expect(page.locator("body")).toContainText(/wallet|connect/i, { timeout: 30_000 });
  });

  test("no Approve, Hold or Release button is enabled for an anonymous visitor", async ({ page }) => {
    await page.goto("/review/2/0");
    await page.waitForLoadState("networkidle");

    for (const label of [/^Approve$/i, /^Hold$/i, /^Release$/i]) {
      const button = page.getByRole("button", { name: label });
      const count = await button.count();
      for (let i = 0; i < count; i++) {
        await expect(button.nth(i)).toBeDisabled();
      }
    }
  });

  /* Generating a report is allowed to anyone; acting on one is not. If this
     ever inverts, the product's whole claim has quietly failed. */
  test("the advisory report never carries a control that could settle a milestone", async ({ page }) => {
    await page.goto("/review/2/0");
    await page.waitForLoadState("networkidle");

    const enabledSettlement = page.getByRole("button", { name: /approve|release|pay|settle/i })
      .and(page.locator("button:not([disabled])"));
    await expect(enabledSettlement).toHaveCount(0);
  });
});

test.describe("the sponsor wizard gates", () => {
  test("the wizard opens on step one with the later steps locked", async ({ page }) => {
    await page.goto("/sponsor");
    await expect(page.getByRole("navigation", { name: /setup progress/i })).toBeVisible({ timeout: 30_000 });

    const steps = page.getByRole("navigation", { name: /setup progress/i }).getByRole("button");
    await expect(steps).toHaveCount(4);

    /* Step one is reachable. Everything past it is locked until the step before
       it is genuinely complete — the rule lives in completedThrough(), and this
       is the assertion that it reaches the screen. */
    await expect(steps.nth(0)).toBeEnabled();
    await expect(steps.nth(1)).toBeDisabled();
    await expect(steps.nth(2)).toBeDisabled();
    await expect(steps.nth(3)).toBeDisabled();
  });

  test("nothing on the first step can sign or fund anything", async ({ page }) => {
    await page.goto("/sponsor");
    await page.waitForLoadState("networkidle");
    const signing = page.getByRole("button", { name: /lock and sign|fund .* USDC/i })
      .and(page.locator("button:not([disabled])"));
    await expect(signing).toHaveCount(0);
  });
});

test.describe("the builder desk without a wallet", () => {
  test("it asks for a wallet instead of offering someone else's milestones", async ({ page }) => {
    await page.goto("/builder");
    await expect(page.locator("body")).toContainText(/wallet|connect/i, { timeout: 30_000 });
  });
});

test.describe("the advisory API", () => {
  /* The endpoint is same-origin only. A cross-origin POST is how an automated
     party would try to reach it, so it should not get a report back. */
  test("a cross-origin request cannot generate a report", async ({ request }) => {
    const response = await request.post("/api/advisory", {
      headers: { origin: "https://not-sprintos.example", "content-type": "application/json" },
      data: { engagement_id: "2", milestone_idx: 0 },
      failOnStatusCode: false,
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("a generated report says in its own body that it is not binding", async ({ request }) => {
    const response = await request.get(
      "/api/advisory?engagement_id=2&milestone_idx=0" +
        "&evidence_hash=243f8ae7bbfa484711fa8522423cd36b88b64d39f5a7ba198f8d9b2ba420773e",
      { failOnStatusCode: false },
    );
    /* A checkout with no document store has no stored report to return, and
       that is a correct answer rather than a failure. Only a deployment that
       actually hands one back has something to assert about. */
    const body = response.status() === 200 ? await response.json().catch(() => null) : null;
    test.skip(!body?.report, "No stored advisory report on this deployment.");

    expect(body.report.binding).toBe(false);
    expect(body.report.disclaimer).toMatch(/not binding/i);
    /* The report must never carry anything shaped like an instruction to pay. */
    expect(Object.keys(body.report)).not.toContain("authorize");
    expect(Object.keys(body.report)).not.toContain("release");
  });
});
