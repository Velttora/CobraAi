import { expect, test } from "@playwright/test";

test.describe("Audit access", () => {
  test("usuario no autenticado no accede a auditoría", async ({ page }) => {
    await page.goto("/audit");
    await expect(page).toHaveURL(/login/);
  });
});
