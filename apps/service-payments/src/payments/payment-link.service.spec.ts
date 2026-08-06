import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PaymentLinksService } from "./payments.service";

function buildService(overrides: { tenantIntegrations?: { resolveByChannel: ReturnType<typeof vi.fn> } } = {}) {
  const prisma = {
    debt: { findFirst: vi.fn() },
    paymentLink: {
      create: vi.fn(),
      findFirst: vi.fn()
    }
  };
  const config = { get: vi.fn(() => "http://localhost:3001/pay") };
  const gateway = { createCheckout: vi.fn() };
  const confirmation = { confirmPayment: vi.fn() };
  const tenantIntegrations =
    overrides.tenantIntegrations ??
    ({ resolveByChannel: vi.fn().mockResolvedValue({ provider: "mercadopago" }) } as {
      resolveByChannel: ReturnType<typeof vi.fn>;
    });

  const service = new PaymentLinksService(
    prisma as never,
    config as never,
    gateway as never,
    confirmation as never,
    tenantIntegrations as never
  );

  return { service, prisma, config, gateway, confirmation, tenantIntegrations };
}

describe("PaymentLinksService.create", () => {
  it("genera link con expiración por defecto 48h y escribe el provider configurado del tenant", async () => {
    const { service, prisma, tenantIntegrations } = buildService({
      tenantIntegrations: { resolveByChannel: vi.fn().mockResolvedValue({ provider: "wompi" }) }
    });
    prisma.debt.findFirst.mockResolvedValue({
      id: "debt-1",
      currency: "COP",
      amountOutstanding: 100000,
      debtor: { address: { country: "CO" }, name: "Juan Pérez" },
      tenant: { name: "Demo" }
    });
    prisma.paymentLink.create.mockImplementation(({ data }: { data: { provider: string; gateway: string } }) => ({
      id: "link-1",
      token: "tok-abc",
      expiresAt: new Date(Date.now() + 48 * 3600000),
      currency: "COP",
      ...data
    }));

    const result = await service.create("tenant-1", { debt_id: "debt-1" });

    expect(tenantIntegrations.resolveByChannel).toHaveBeenCalledWith("tenant-1", "payments");
    expect(prisma.paymentLink.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: "wompi" }) })
    );
    expect(result.url).toContain("tok-abc");
    expect(result.amount).toBe(100000);
  });

  it("lanza BadRequestException cuando el tenant no tiene un método de cobro configurado", async () => {
    const { service, prisma } = buildService({
      tenantIntegrations: { resolveByChannel: vi.fn().mockResolvedValue(null) }
    });
    prisma.debt.findFirst.mockResolvedValue({
      id: "debt-1",
      currency: "COP",
      amountOutstanding: 100000,
      debtor: { address: { country: "CO" }, name: "Juan Pérez" },
      tenant: { name: "Demo" }
    });

    await expect(service.create("tenant-1", { debt_id: "debt-1" })).rejects.toThrow(BadRequestException);
    expect(prisma.paymentLink.create).not.toHaveBeenCalled();
  });
});

describe("PaymentLinksService.getPublicByToken", () => {
  it("returns provider and method alongside the existing gateway field", async () => {
    const { service, prisma } = buildService();
    prisma.paymentLink.findFirst.mockResolvedValue({
      status: "active",
      expiresAt: new Date(Date.now() + 3600000),
      amount: 50000,
      currency: "COP",
      gateway: "mercadopago",
      provider: "mercadopago",
      method: null,
      token: "tok-xyz",
      debt: { debtor: { address: { country: "CO" }, name: "Ana Torres" } },
      tenant: { name: "Acme" }
    });

    const result = await service.getPublicByToken("tok-xyz");

    expect(result.provider).toBe("mercadopago");
    expect(result.gateway).toBe("mercadopago");
    expect(result.company_name).toBe("Acme");
  });
});

describe("PaymentLinksService.checkout", () => {
  it("ignores a debtor-supplied provider in the request body and always resolves via the tenant's configured integration", async () => {
    const { service, prisma, gateway } = buildService();
    prisma.paymentLink.findFirst.mockResolvedValue({
      tenantId: "tenant-1",
      token: "tok-1",
      provider: "mercadopago",
      expiresAt: new Date(Date.now() + 3600000),
      amount: 10000,
      currency: "COP",
      debt: { debtor: { name: "Juan Pérez" } }
    });
    gateway.createCheckout.mockResolvedValue({ gateway_payment_url: "https://mp.example/x", gateway_ref: "ref-1" });

    await service.checkout("tok-1", "stripe");

    expect(gateway.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", token: "tok-1" })
    );
    // The debtor-supplied "stripe" never reaches GatewayService as a dispatch key.
    expect(gateway.createCheckout).not.toHaveBeenCalledWith(expect.objectContaining({ provider: "stripe" }));
  });

  it("returns the instructions shape with a null payment URL for transfer", async () => {
    const { service, prisma, gateway } = buildService();
    prisma.paymentLink.findFirst.mockResolvedValue({
      tenantId: "tenant-1",
      token: "tok-2",
      provider: "transfer",
      expiresAt: new Date(Date.now() + 3600000),
      amount: 10000,
      currency: "COP",
      debt: { debtor: { name: "Juan Pérez" } }
    });
    gateway.createCheckout.mockResolvedValue({
      gateway_payment_url: "",
      gateway_ref: "ref-2",
      instructions: "Transferencia bancaria. Banco: Bancolombia. Referencia: tok-2."
    });

    const result = await service.checkout("tok-2");

    expect(result.gateway_payment_url).toBeNull();
    expect(result.instructions).toContain("Bancolombia");
  });

  it("returns a real, non-null payment URL for external_link", async () => {
    const { service, prisma, gateway } = buildService();
    prisma.paymentLink.findFirst.mockResolvedValue({
      tenantId: "tenant-1",
      token: "tok-3",
      provider: "external_link",
      expiresAt: new Date(Date.now() + 3600000),
      amount: 10000,
      currency: "COP",
      debt: { debtor: { name: "Juan Pérez" } }
    });
    gateway.createCheckout.mockResolvedValue({
      gateway_payment_url: "https://checkout.x.com/pagar?ref=tok-3",
      gateway_ref: "tok-3"
    });

    const result = await service.checkout("tok-3");

    expect(result.gateway_payment_url).toBe("https://checkout.x.com/pagar?ref=tok-3");
  });
});
