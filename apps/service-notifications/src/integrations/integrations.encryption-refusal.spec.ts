import { describe, expect, it, vi } from "vitest";

// Se simula el guard en vez de borrar process.env: la variable es global del
// proceso y borrarla contamina a las demás specs que corren en el mismo worker.
vi.mock("./encryption-key.guard", () => ({
  checkEncryptionKey: () => ({
    usable: false,
    reason: "ENCRYPTION_KEY_V1 no está configurada."
  })
}));

import { IntegrationsService } from "./integrations.service";

describe("IntegrationsService sin llave de cifrado utilizable", () => {
  function build(): IntegrationsService {
    return new IntegrationsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => "https://api.test/webhooks" } as never
    );
  }

  // Sin llave, guardar no puede funcionar — pero el resto del servicio sí.
  // El rechazo nombra la variable en vez de dejar que encryptSecretBundle
  // lance un 500 opaco que el usuario lee como problema de red.
  it("rechaza el guardado nombrando la variable que falta", async () => {
    await expect(
      build().save("tenant-1", "sendgrid", { mode: "byo" } as never, "admin")
    ).rejects.toThrow(/ENCRYPTION_KEY_V1/);
  });

  it("rechaza antes de tocar el proveedor, no a mitad del guardado", async () => {
    const emailConnect = { connectByo: vi.fn(), connectManaged: vi.fn() };
    const service = new IntegrationsService(
      {} as never,
      {} as never,
      emailConnect as never,
      {} as never,
      { get: () => "https://api.test/webhooks" } as never
    );

    await expect(
      service.save("tenant-1", "sendgrid", { mode: "byo" } as never, "admin")
    ).rejects.toThrow();
    expect(emailConnect.connectByo).not.toHaveBeenCalled();
  });

  it("un rol no admin sigue fallando por permisos, no por la llave", async () => {
    await expect(
      build().save("tenant-1", "sendgrid", { mode: "byo" } as never, "viewer")
    ).rejects.toThrow(/administradores/);
  });
});
