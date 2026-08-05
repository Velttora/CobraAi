import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { GatewayService } from "./gateway.service";
import { StripeGateway } from "./stripe.gateway";
import { MercadoPagoGateway } from "./mercadopago.gateway";
import { WompiGateway } from "./wompi.gateway";
import { PayuGateway } from "./payu.gateway";
import { EpaycoGateway } from "./epayco.gateway";
import { ExternalLinkGateway } from "./external-link.gateway";
import { TransferGateway } from "./transfer.gateway";

function buildService(tenantIntegrations: { resolveByChannel: ReturnType<typeof vi.fn> }) {
  return new GatewayService(
    tenantIntegrations as never,
    new StripeGateway(),
    new MercadoPagoGateway(),
    new WompiGateway(),
    new PayuGateway(),
    new EpaycoGateway(),
    new ExternalLinkGateway(),
    new TransferGateway()
  );
}

const REQUEST = {
  tenantId: "tenant-1",
  amount: 100000,
  currency: "COP",
  token: "tok-1",
  debtorName: "Juan Pérez",
  returnUrl: "https://app.cobrai.dev/pay/tok-1/done"
};

describe("GatewayService.createCheckout", () => {
  it("dispatches to the adapter matching the tenant's configured provider", async () => {
    const tenantIntegrations = {
      resolveByChannel: vi.fn().mockResolvedValue({
        provider: "transfer",
        publicConfig: { bankName: "Bancolombia" },
        secrets: {}
      })
    };
    const service = buildService(tenantIntegrations);

    const result = await service.createCheckout(REQUEST);

    expect(tenantIntegrations.resolveByChannel).toHaveBeenCalledWith("tenant-1", "payments");
    expect(result.instructions).toContain("Bancolombia");
  });

  it("throws BadRequestException naming the missing method when no verified payments integration exists, never falling back to transfer", async () => {
    const tenantIntegrations = { resolveByChannel: vi.fn().mockResolvedValue(null) };
    const service = buildService(tenantIntegrations);

    await expect(service.createCheckout(REQUEST)).rejects.toThrow(BadRequestException);
    await expect(service.createCheckout(REQUEST)).rejects.toThrow(
      "La organización no tiene un método de cobro configurado"
    );
  });

  it("passes the decrypted secrets and publicConfig from TenantIntegrationService straight into the adapter", async () => {
    const tenantIntegrations = {
      resolveByChannel: vi.fn().mockResolvedValue({
        provider: "external_link",
        publicConfig: { template: "https://checkout.x.com/pagar?ref={ref}" },
        secrets: {}
      })
    };
    const service = buildService(tenantIntegrations);

    const result = await service.createCheckout(REQUEST);

    expect(result.gateway_payment_url).toBe("https://checkout.x.com/pagar?ref=tok-1");
  });

  it("propagates a provider adapter's own error message unchanged", async () => {
    const tenantIntegrations = {
      resolveByChannel: vi.fn().mockResolvedValue({
        provider: "stripe",
        publicConfig: {},
        secrets: {}
      })
    };
    const service = buildService(tenantIntegrations);

    await expect(service.createCheckout(REQUEST)).rejects.toThrow("Stripe: falta secretKey del tenant");
  });

  it("throws a BadRequestException naming the provider when no adapter is registered for it", async () => {
    const tenantIntegrations = {
      resolveByChannel: vi.fn().mockResolvedValue({
        provider: "twilio_whatsapp",
        publicConfig: {},
        secrets: {}
      })
    };
    const service = buildService(tenantIntegrations);

    await expect(service.createCheckout(REQUEST)).rejects.toThrow(BadRequestException);
  });
});
