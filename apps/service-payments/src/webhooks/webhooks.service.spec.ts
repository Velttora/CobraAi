import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { DecryptedIntegration } from "@cobrai/integrations";
import { WebhooksService } from "./webhooks.service";

function buildIntegration(overrides: Partial<DecryptedIntegration> = {}): DecryptedIntegration {
  return {
    id: "integration-1",
    tenantId: "tenant-1",
    provider: "stripe",
    mode: "byo",
    status: "verified",
    publicConfig: {},
    secrets: {},
    webhookToken: "tok",
    verifiedAt: new Date(),
    ...overrides
  } as DecryptedIntegration;
}

function buildService() {
  const link = {
    id: "link-1",
    tenantId: "tenant-1",
    debtId: "debt-1",
    amount: "1000.00",
    currency: "COP",
    gateway: "transfer",
    provider: "stripe"
  };
  const prisma = {
    paymentLink: { findFirst: vi.fn().mockResolvedValue(link) }
  };
  const confirmation = { confirmPayment: vi.fn().mockResolvedValue({ duplicate: false }) };
  const service = new WebhooksService(prisma as never, confirmation as never);
  return { service, prisma, confirmation, link };
}

describe("WebhooksService", () => {
  describe("Stripe", () => {
    it("confirms from checkout.session.completed's metadata.token", async () => {
      const { service, confirmation } = buildService();
      const integration = buildIntegration({ provider: "stripe" });
      const rawBody = JSON.stringify({
        type: "checkout.session.completed",
        data: { object: { id: "cs_1", metadata: { token: "tok-1" } } }
      });

      await service.handle(integration, rawBody);

      expect(confirmation.confirmPayment).toHaveBeenCalledWith(
        expect.objectContaining({ gatewayRef: "cs_1", provider: "stripe", gateway: "transfer" })
      );
    });

    it("ignores an unrelated event type", async () => {
      const { service, confirmation } = buildService();
      const integration = buildIntegration({ provider: "stripe" });
      const rawBody = JSON.stringify({ type: "payment_intent.created", data: { object: { id: "pi_1" } } });

      await service.handle(integration, rawBody);

      expect(confirmation.confirmPayment).not.toHaveBeenCalled();
    });
  });

  describe("Mercado Pago (anti-regression)", () => {
    it("still confirms from external_reference/data.id against the new token-routed handler", async () => {
      const { service, confirmation } = buildService();
      const integration = buildIntegration({ provider: "mercadopago" });
      const rawBody = JSON.stringify({ data: { id: "mp-gw-1" }, external_reference: "tok-1" });

      await service.handle(integration, rawBody);

      expect(confirmation.confirmPayment).toHaveBeenCalledWith(expect.objectContaining({ gatewayRef: "mp-gw-1" }));
    });
  });

  describe("Wompi", () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("recovers the token via one Payment Link lookup keyed by payment_link_id, then confirms", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { sku: "tok-1" } })
      }) as never;
      const { service, confirmation } = buildService();
      const integration = buildIntegration({ provider: "wompi", secrets: { privateKey: "priv_test" } });
      const rawBody = JSON.stringify({ data: { transaction: { id: "txn-1", payment_link_id: "wompi-link-1" } } });

      await service.handle(integration, rawBody);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://production.wompi.co/v1/payment_links/wompi-link-1",
        expect.objectContaining({ headers: { Authorization: "Bearer priv_test" } })
      );
      expect(confirmation.confirmPayment).toHaveBeenCalledWith(expect.objectContaining({ gatewayRef: "txn-1" }));
    });

    it("is a no-op when the Payment Link lookup fails", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false }) as never;
      const { service, confirmation } = buildService();
      const integration = buildIntegration({ provider: "wompi", secrets: { privateKey: "priv_test" } });
      const rawBody = JSON.stringify({ data: { transaction: { id: "txn-1", payment_link_id: "wompi-link-1" } } });

      await service.handle(integration, rawBody);

      expect(confirmation.confirmPayment).not.toHaveBeenCalled();
    });
  });

  describe("PayU", () => {
    it("confirms only on state_pol=4 (Approved)", async () => {
      const { service, confirmation } = buildService();
      const integration = buildIntegration({ provider: "payu" });
      const approved = new URLSearchParams({
        state_pol: "4",
        reference_sale: "tok-1",
        transaction_id: "txn-1"
      }).toString();

      await service.handle(integration, approved);

      expect(confirmation.confirmPayment).toHaveBeenCalledWith(expect.objectContaining({ gatewayRef: "txn-1" }));
    });

    it("is a no-op on a Declined state (state_pol=6)", async () => {
      const { service, confirmation } = buildService();
      const integration = buildIntegration({ provider: "payu" });
      const declined = new URLSearchParams({
        state_pol: "6",
        reference_sale: "tok-1",
        transaction_id: "txn-1"
      }).toString();

      await service.handle(integration, declined);

      expect(confirmation.confirmPayment).not.toHaveBeenCalled();
    });
  });

  describe("ePayco", () => {
    it("confirms only on x_cod_transaction_state=1 (Aceptada)", async () => {
      const { service, confirmation } = buildService();
      const integration = buildIntegration({ provider: "epayco" });
      const accepted = new URLSearchParams({
        x_cod_transaction_state: "1",
        x_id_factura: "tok-1",
        x_ref_payco: "ref-1"
      }).toString();

      await service.handle(integration, accepted);

      expect(confirmation.confirmPayment).toHaveBeenCalledWith(expect.objectContaining({ gatewayRef: "ref-1" }));
    });

    it("is a no-op on a pending state (x_cod_transaction_state=3)", async () => {
      const { service, confirmation } = buildService();
      const integration = buildIntegration({ provider: "epayco" });
      const pending = new URLSearchParams({
        x_cod_transaction_state: "3",
        x_id_factura: "tok-1",
        x_ref_payco: "ref-1"
      }).toString();

      await service.handle(integration, pending);

      expect(confirmation.confirmPayment).not.toHaveBeenCalled();
    });
  });

  describe("confirmFromToken", () => {
    it("is a no-op (200, nothing written) when the token matches no payment link for this tenant", async () => {
      const { service, confirmation, prisma } = buildService();
      prisma.paymentLink.findFirst = vi.fn().mockResolvedValue(null);
      const integration = buildIntegration({ provider: "stripe" });
      const rawBody = JSON.stringify({
        type: "checkout.session.completed",
        data: { object: { id: "cs_1", metadata: { token: "tok-1" } } }
      });

      await service.handle(integration, rawBody);

      expect(confirmation.confirmPayment).not.toHaveBeenCalled();
    });

    it("scopes the payment-link lookup to the resolved integration's own tenantId (T-08-07f: rejects cross-tenant token replay)", async () => {
      const { service, prisma } = buildService();
      const integration = buildIntegration({ provider: "stripe", tenantId: "tenant-attacker" });
      const rawBody = JSON.stringify({
        type: "checkout.session.completed",
        data: { object: { id: "cs_1", metadata: { token: "victim-tenant-token" } } }
      });

      await service.handle(integration, rawBody);

      expect(prisma.paymentLink.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-attacker" }) })
      );
    });

    it("records the payment with the link's own provider/gateway, not a value re-derived from the webhook", async () => {
      const { service, confirmation, prisma, link } = buildService();
      prisma.paymentLink.findFirst = vi.fn().mockResolvedValue({ ...link, provider: "stripe", gateway: "transfer" });
      const integration = buildIntegration({ provider: "stripe" });
      const rawBody = JSON.stringify({
        type: "checkout.session.completed",
        data: { object: { id: "cs_1", metadata: { token: "tok-1" } } }
      });

      await service.handle(integration, rawBody);

      expect(confirmation.confirmPayment).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "stripe", gateway: "transfer" })
      );
    });
  });
});

describe("WebhooksService.handle dispatch (beforeEach guard against leaking fetch mocks)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("no-ops for a provider with no registered handler (defensive default branch)", async () => {
    const { service, confirmation } = buildService();
    const integration = buildIntegration({ provider: "external_link" });

    await service.handle(integration, "{}");

    expect(confirmation.confirmPayment).not.toHaveBeenCalled();
  });
});
