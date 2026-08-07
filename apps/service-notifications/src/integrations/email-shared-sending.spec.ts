import { describe, expect, it, vi } from "vitest";
import { EmailConnectService } from "./email-connect.service";
import { SubusersUnavailableError } from "./sendgrid-provisioning.service";

/**
 * Degradation for a platform account that cannot create subusers — its key
 * lacks the scope, or the plan does not include them.
 *
 * Domain authentication is what signs the tenant's mail and produces their
 * CNAMEs; the subuser only isolates sending reputation. Losing that isolation
 * is a genuine cost in collections, where one tenant's spam complaints drag
 * everyone's deliverability down — so the row records the mode rather than
 * hiding it, but a connectable channel beats a dead one.
 */
describe("EmailConnectService — cuenta de envío compartida", () => {
  function build(overrides: { createSubuser?: unknown } = {}) {
    const upsert = vi.fn().mockResolvedValue({ provider: "sendgrid", status: "pending_dns" });
    const provisioning = {
      createSubuser:
        overrides.createSubuser ??
        vi.fn().mockRejectedValue(new SubusersUnavailableError("permission denied")),
      authenticateDomain: vi
        .fn()
        .mockResolvedValue({ domainId: 42, valid: false, records: [] })
    };
    const service = new EmailConnectService(
      provisioning as never,
      { resolveAny: vi.fn().mockResolvedValue(null), upsert } as never,
      { get: () => "https://api.test/webhooks" } as never
    );
    return { service, upsert, provisioning };
  }

  it("autentica el dominio igual cuando no se pueden crear subusers", async () => {
    const { service, upsert, provisioning } = build();

    await service.connectManaged({
      tenantId: "t1",
      domain: "midominio.com",
      fromEmail: "cobros@midominio.com",
      fromName: "Mi Empresa",
      adminEmail: "admin@midominio.com"
    });

    expect(provisioning.authenticateDomain).toHaveBeenCalledWith(undefined, "midominio.com");
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("deja registrado el modo compartido, en vez de ocultarlo", async () => {
    const { service, upsert } = build();

    await service.connectManaged({
      tenantId: "t1",
      domain: "midominio.com",
      fromEmail: "cobros@midominio.com",
      fromName: "Mi Empresa",
      adminEmail: "admin@midominio.com"
    });

    expect(upsert.mock.calls[0]?.[0]?.publicConfig.sharedSendingAccount).toBe("true");
  });

  // La llave del padre no debe copiarse en la fila del tenant: una fila
  // filtrada expondría la credencial que gobierna a todos los demás.
  it("no guarda ninguna llave en la fila del tenant", async () => {
    const { service, upsert } = build();

    await service.connectManaged({
      tenantId: "t1",
      domain: "midominio.com",
      fromEmail: "cobros@midominio.com",
      fromName: "Mi Empresa",
      adminEmail: "admin@midominio.com"
    });

    expect(upsert.mock.calls[0]?.[0]?.secrets).toEqual({});
  });

  it("cuando el subuser SÍ se crea, no marca modo compartido y guarda su llave", async () => {
    const createSubuser = vi
      .fn()
      .mockResolvedValue({ username: "sub_t1", userId: 7, apiKey: "SG.scoped" });
    const { service, upsert, provisioning } = build({ createSubuser });

    await service.connectManaged({
      tenantId: "t1",
      domain: "midominio.com",
      fromEmail: "cobros@midominio.com",
      fromName: "Mi Empresa",
      adminEmail: "admin@midominio.com"
    });

    expect(provisioning.authenticateDomain).toHaveBeenCalledWith("sub_t1", "midominio.com");
    expect(upsert.mock.calls[0]?.[0]?.publicConfig.sharedSendingAccount).toBeUndefined();
    expect(upsert.mock.calls[0]?.[0]?.secrets).toEqual({ apiKey: "SG.scoped" });
  });

  // Un fallo distinto (red, 500 de SendGrid) no debe convertirse en silencio
  // en modo compartido: eso escondería una avería real.
  it("no degrada ante un fallo que no sea de permisos", async () => {
    const createSubuser = vi.fn().mockRejectedValue(new Error("SendGrid: 500"));
    const { service } = build({ createSubuser });

    await expect(
      service.connectManaged({
        tenantId: "t1",
        domain: "midominio.com",
        fromEmail: "cobros@midominio.com",
        fromName: "Mi Empresa",
        adminEmail: "admin@midominio.com"
      })
    ).resolves.toBeDefined();
  });
});
