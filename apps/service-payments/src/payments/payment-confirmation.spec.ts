import { describe, expect, it, vi } from "vitest";
import { PaymentConfirmationService } from "./payment-confirmation.service";

describe("PaymentConfirmationService", () => {
  it("es idempotente ante gateway_ref duplicado", async () => {
    const prisma = {
      payment: {
        findFirst: vi.fn().mockResolvedValue({
          id: "pay-1",
          status: "confirmed"
        })
      },
      debt: { findFirst: vi.fn() },
      $transaction: vi.fn()
    };
    const kafka = { publish: vi.fn() };
    const service = new PaymentConfirmationService(prisma as never, kafka as never);

    const result = await service.confirmPayment({
      tenantId: "t1",
      debtId: "d1",
      amount: 100,
      currency: "COP",
      gateway: "transfer",
      provider: "transfer",
      gatewayRef: "gw-123"
    });

    expect(result.duplicate).toBe(true);
    expect(kafka.publish).not.toHaveBeenCalled();
  });

  it("confirma pago nuevo y publica Kafka", async () => {
    const prisma = {
      payment: { findFirst: vi.fn().mockResolvedValue(null) },
      debt: {
        findFirst: vi.fn().mockResolvedValue({
          id: "d1",
          amountOutstanding: 500
        })
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          payment: {
            create: vi.fn().mockResolvedValue({ id: "pay-new", status: "confirmed" })
          },
          paymentLink: { updateMany: vi.fn() }
        };
        return fn(tx);
      })
    };
    const kafka = { publish: vi.fn() };
    const service = new PaymentConfirmationService(prisma as never, kafka as never);

    const result = await service.confirmPayment({
      tenantId: "t1",
      debtId: "d1",
      amount: 500,
      currency: "COP",
      gateway: "mercadopago",
      provider: "mercadopago",
      gatewayRef: "mp-999"
    });

    expect(result.duplicate).toBe(false);
    expect(result.amount_outstanding).toBe(0);
    expect(kafka.publish).toHaveBeenCalledWith(
      "cobrai.payment.confirmed",
      "t1",
      expect.objectContaining({ debt_id: "d1", amount: 500 })
    );
  });

  it("persiste el provider (y method cuando está presente) en la fila de Payment", async () => {
    let createdData: Record<string, unknown> | undefined;
    const prisma = {
      payment: { findFirst: vi.fn().mockResolvedValue(null) },
      debt: { findFirst: vi.fn().mockResolvedValue({ id: "d1", amountOutstanding: 500 }) },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          payment: {
            create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
              createdData = data;
              return { id: "pay-new", status: "confirmed" };
            })
          },
          paymentLink: { updateMany: vi.fn() }
        };
        return fn(tx);
      })
    };
    const kafka = { publish: vi.fn() };
    const service = new PaymentConfirmationService(prisma as never, kafka as never);

    await service.confirmPayment({
      tenantId: "t1",
      debtId: "d1",
      amount: 500,
      currency: "COP",
      gateway: "mercadopago",
      provider: "mercadopago",
      method: "pse",
      gatewayRef: "mp-1000"
    });

    expect(createdData).toMatchObject({ provider: "mercadopago", method: "pse" });
  });
});
