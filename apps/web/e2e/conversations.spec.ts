import { expect, test } from "@playwright/test";

test.describe("Conversaciones", () => {
  test.skip(!process.env.E2E_AUTH_READY, "Requiere sesión Clerk de prueba");

  test("lista de conversaciones carga con filtros de canal", async ({ page }) => {
    await page.goto("/conversations");
    await expect(page.getByRole("heading", { name: "Conversaciones" })).toBeVisible();
    await expect(page.getByRole("button", { name: "WhatsApp" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Voz" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Email" })).toBeVisible();
  });

  test("?status=escalated preselecciona el filtro de estado", async ({ page }) => {
    await page.goto("/conversations?status=escalated");
    await expect(page.getByRole("combobox").first()).toHaveValue("escalated");
  });
});
