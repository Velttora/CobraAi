import { expect, test } from "@playwright/test";

test.describe("Login", () => {
  test("muestra formulario de inicio de sesión", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator(".cl-signIn-root, .cl-rootBox").first()).toBeVisible({
      timeout: 10_000
    });
  });

  test("redirige dashboard sin sesión", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
  });
});
