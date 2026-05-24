import { expect, test } from "@playwright/test";

test.describe("Portfolio import", () => {
  test.skip(!process.env.E2E_AUTH_READY, "Requiere sesión Clerk de prueba");

  test("página de portafolios carga", async ({ page }) => {
    await page.goto("/portfolios");
    await expect(page.getByRole("heading", { name: /portafolios/i })).toBeVisible();
  });
});
