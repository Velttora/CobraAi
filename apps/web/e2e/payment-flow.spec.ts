import { expect, test } from "@playwright/test";

test.describe("Payment flow", () => {
  test("página pública /pay muestra error con token inválido", async ({ page }) => {
    await page.goto("/pay/00000000-0000-0000-0000-000000000000");
    await expect(
      page.getByText(/inválido|no encontrado|expirado|Link de pago|no disponible/i)
    ).toBeVisible({
      timeout: 20_000
    });
  });
});
