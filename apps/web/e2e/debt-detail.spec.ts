import { expect, test } from "@playwright/test";

test.describe("Debt detail", () => {
  test.skip(!process.env.E2E_AUTH_READY, "Requiere sesión Clerk de prueba");

  test("muestra detalle de deuda", async ({ page }) => {
    const debtId = process.env.E2E_DEBT_ID;
    test.skip(!debtId, "E2E_DEBT_ID no configurado");
    await page.goto(`/debts/${debtId}`);
    await expect(page.getByText(/Monto pendiente/i)).toBeVisible();
  });
});
