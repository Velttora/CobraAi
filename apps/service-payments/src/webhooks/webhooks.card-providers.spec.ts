import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIntegration, buildService } from "./webhooks.fixtures";

describe("WebhooksService", () => {
  describe("Stripe", () => {
    it("confirms from checkout.session.completed's metadata.token when payment_status is paid", async () => {
      const { service, confirmation } = buildService();
      const integration = buildIntegration({ provider: "stripe" });
      const rawBody = JSON.stringify({
        type: "checkout.session.completed",
        data: { object: { id: "cs_1", payment_status: "paid", metadata: { token: "tok-1" } } }
      });

      await service.handle(integration, rawBody);

      expect(confirmation.confirmPayment).toHaveBeenCalledWith(
        expect.objectContaining({ gatewayRef: "cs_1", provider: "stripe", gateway: "transfer" })
      );
    });

    // Los medios de pago diferidos completan la sesión con payment_status
    // "unpaid" y liquidan (o fallan) después. Confirmar solo por el evento
    // marcaba esas deudas como pagadas antes de que existiera el dinero.
    it.each(["unpaid", "no_payment_required", undefined])(
      "no confirma cuando payment_status es %s",
      async (paymentStatus) => {
        const { service, confirmation } = buildService();
        const integration = buildIntegration({ provider: "stripe" });
        const rawBody = JSON.stringify({
          type: "checkout.session.completed",
          data: {
            object: {
              id: "cs_1",
              ...(paymentStatus ? { payment_status: paymentStatus } : {}),
              metadata: { token: "tok-1" }
            }
          }
        });

        await service.handle(integration, rawBody);

        expect(confirmation.confirmPayment).not.toHaveBeenCalled();
      }
    );

    it("ignores an unrelated event type", async () => {
      const { service, confirmation } = buildService();
      const integration = buildIntegration({ provider: "stripe" });
      const rawBody = JSON.stringify({ type: "payment_intent.created", data: { object: { id: "pi_1" } } });

      await service.handle(integration, rawBody);

      expect(confirmation.confirmPayment).not.toHaveBeenCalled();
    });
  });

  describe("Mercado Pago", () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    // La notificación de MP solo trae `data.id`. Leer `external_reference` del
    // cuerpo daba siempre vacío, así que todo webhook real caía en no-op y
    // respondía 200 — MP no reintenta, y ningún pago llegaba a conciliarse.
    it("recovers the reference via GET /v1/payments/{id} and confirms when approved", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "approved", external_reference: "tok-1" })
      }) as never;
      const { service, confirmation } = buildService();
      const integration = buildIntegration({
        provider: "mercadopago",
        secrets: { accessToken: "mp_test" }
      });
      const rawBody = JSON.stringify({ data: { id: "mp-gw-1" } });

      await service.handle(integration, rawBody);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.mercadopago.com/v1/payments/mp-gw-1",
        expect.objectContaining({ headers: { Authorization: "Bearer mp_test" } })
      );
      expect(confirmation.confirmPayment).toHaveBeenCalledWith(
        expect.objectContaining({ gatewayRef: "mp-gw-1" })
      );
    });

    it.each(["pending", "in_process", "rejected", "refunded", "cancelled"])(
      "no confirma un pago en estado %s",
      async (status) => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status, external_reference: "tok-1" })
        }) as never;
        const { service, confirmation } = buildService();
        const integration = buildIntegration({
          provider: "mercadopago",
          secrets: { accessToken: "mp_test" }
        });

        await service.handle(integration, JSON.stringify({ data: { id: "mp-gw-1" } }));

        expect(confirmation.confirmPayment).not.toHaveBeenCalled();
      }
    );

    it("es no-op cuando la consulta del pago falla", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false }) as never;
      const { service, confirmation } = buildService();
      const integration = buildIntegration({
        provider: "mercadopago",
        secrets: { accessToken: "mp_test" }
      });

      await service.handle(integration, JSON.stringify({ data: { id: "mp-gw-1" } }));

      expect(confirmation.confirmPayment).not.toHaveBeenCalled();
    });
  });
});
