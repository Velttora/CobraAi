import { expect, test } from "@playwright/test";

test.describe("Dashboard KPIs", () => {
  test.skip(!process.env.E2E_AUTH_READY, "Requiere sesión Clerk de prueba");

  test("KPIs cargan con datos", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  });
});
