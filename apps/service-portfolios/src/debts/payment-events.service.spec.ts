import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentEventsService } from "./payment-events.service";

function makePrisma(
  data: {
    debt?: Record<string, unknown> | null;
    promises?: Record<string, unknown>[];
    activePlans?: { id: string }[];
    openInstallments?: number;
  } = {}
) {
  const debt = data.debt === undefined ? baseDebt() : data.debt;
  return {
    debt: {
      findFirst: vi.fn().mockResolvedValue(debt),
      update: vi.fn().mockResolvedValue(debt)
    },
    promiseToPay: {
      findMany: vi.fn().mockResolvedValue(data.promises ?? []),
      update: vi.fn().mockResolvedValue({}),
      // Cuotas abiertas del plan y promesas sueltas comparten este contador en
      // el mock; los tests que necesitan distinguirlos lo sobrescriben.
      count: vi.fn().mockResolvedValue(data.openInstallments ?? 0)
    },
    paymentPlan: {
      findMany: vi.fn().mockResolvedValue(data.activePlans ?? []),
      findFirst: vi.fn().mockResolvedValue(
        (data.activePlans ?? []).length > 0 ? { id: "plan1" } : null
      ),
      update: vi.fn().mockResolvedValue({})
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    negotiation: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "neg1" })
    }
  };
}

function baseDebt(overrides: Record<string, unknown> = {}) {
  return {
    id: "debt1",
    tenantId: "org1",
    status: "plan",
    amountOutstanding: 1_000_000,
    ...overrides
  };
}

function makeKafka() {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

function published(kafka: ReturnType<typeof makeKafka>, topic: string) {
  return kafka.publish.mock.calls.find((c) => c[0] === topic);
}

let kafka: ReturnType<typeof makeKafka>;

beforeEach(() => {
  kafka = makeKafka();
});

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new PaymentEventsService(prisma as never, kafka as never);
}

describe("PaymentEventsService — plan completado", () => {
  const installment = {
    id: "prom1",
    amount: 800_000,
    promisedDate: new Date("2026-03-01")
  };

  function planCompletedPrisma() {
    const prisma = makePrisma({
      debt: baseDebt({ status: "plan", amountOutstanding: 1_000_000 }),
      promises: [installment],
      activePlans: [{ id: "plan1" }]
    });
    // Tras cerrar la cuota no quedan cuotas abiertas → el plan se completa.
    prisma.promiseToPay.count.mockResolvedValue(0);
    return prisma;
  }

  it("no condona: el remanente sobrevive y la deuda no se cierra sola", async () => {
    const prisma = planCompletedPrisma();
    const service = makeService(prisma);

    // Pactó 800.000 sobre un saldo de 1.000.000: cumplió el acuerdo y quedan
    // 200.000 que son el descuento negociado.
    await service.handlePaymentConfirmed("org1", {
      debt_id: "debt1",
      amount: 800_000,
      amount_outstanding: 200_000
    });

    expect(prisma.paymentPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "completed" } })
    );
    // Condonar es decisión humana: el saldo queda intacto y la deuda espera.
    expect(prisma.debt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { amountOutstanding: 200_000, status: "plan" }
      })
    );
  });

  it("deja anotada la decisión pendiente en la bitácora", async () => {
    const prisma = planCompletedPrisma();
    await makeService(prisma).handlePaymentConfirmed("org1", {
      debt_id: "debt1",
      amount: 800_000,
      amount_outstanding: 200_000
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "debt.settlement_pending_review",
          resourceId: "debt1",
          changes: expect.objectContaining({ remaining_amount: 200_000 })
        })
      })
    );
  });

  it("encola el remanente para que un humano lo apruebe", async () => {
    const prisma = planCompletedPrisma();
    await makeService(prisma).handlePaymentConfirmed("org1", {
      debt_id: "debt1",
      amount: 800_000,
      amount_outstanding: 200_000
    });

    expect(prisma.negotiation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "escalated",
          offerSettlementAmount: 200_000,
          planId: "plan1"
        })
      })
    );
  });

  it("no duplica la solicitud si ya hay una esperando", async () => {
    const prisma = planCompletedPrisma();
    prisma.negotiation.findFirst.mockResolvedValue({ id: "neg-existente" });

    await makeService(prisma).handlePaymentConfirmed("org1", {
      debt_id: "debt1",
      amount: 800_000,
      amount_outstanding: 200_000
    });

    expect(prisma.negotiation.create).not.toHaveBeenCalled();
  });

  it("escribe la deuda una sola vez, con saldo y estado juntos", async () => {
    const prisma = planCompletedPrisma();
    await makeService(prisma).handlePaymentConfirmed("org1", {
      debt_id: "debt1",
      amount: 800_000,
      amount_outstanding: 200_000
    });

    expect(prisma.debt.update).toHaveBeenCalledTimes(1);
  });
});

describe("PaymentEventsService — abono parcial", () => {
  function partialPrisma() {
    const prisma = makePrisma({
      debt: baseDebt({ status: "promised", amountOutstanding: 1_000_000 }),
      promises: [
        { id: "prom1", amount: 500_000, promisedDate: new Date("2026-04-01") }
      ]
    });
    // Queda la promesa suelta abierta (ahora en `partial`).
    prisma.promiseToPay.count.mockResolvedValue(1);
    return prisma;
  }

  it("no retira la deuda de gestión: sigue prometida", async () => {
    const prisma = partialPrisma();
    await makeService(prisma).handlePaymentConfirmed("org1", {
      debt_id: "debt1",
      amount: 100_000,
      amount_outstanding: 900_000
    });

    // paid_partial no es cobrable ni agendable: mandar la deuda ahí por un
    // abono la sacaba de circulación con el compromiso todavía vivo.
    expect(prisma.debt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { amountOutstanding: 900_000, status: "promised" }
      })
    );
  });

  it("marca la promesa como parcial, registra el abono y no publica promise.kept", async () => {
    const prisma = partialPrisma();
    await makeService(prisma).handlePaymentConfirmed("org1", {
      debt_id: "debt1",
      amount: 100_000,
      amount_outstanding: 900_000
    });

    expect(prisma.promiseToPay.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "partial", amountPaid: 100_000 }
      })
    );
    expect(published(kafka, "cobrai.promise.kept")).toBeUndefined();
  });

  it("el segundo abono que completa lo prometido la cierra como cumplida", async () => {
    // Antes cada pago se comparaba contra el monto total de la promesa, así que
    // dos abonos de la mitad nunca la cumplían y al vencer se fichaba como
    // incumplido a quien había pagado todo.
    const prisma = makePrisma({
      debt: baseDebt({ status: "promised", amountOutstanding: 900_000 }),
      promises: [
        {
          id: "prom1",
          amount: 500_000,
          amountPaid: 250_000,
          promisedDate: new Date("2026-04-01")
        }
      ]
    });
    prisma.promiseToPay.count.mockResolvedValue(0);

    await makeService(prisma).handlePaymentConfirmed("org1", {
      debt_id: "debt1",
      amount: 250_000,
      amount_outstanding: 650_000
    });

    expect(prisma.promiseToPay.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "kept", amountPaid: 500_000 }
      })
    );
    expect(published(kafka, "cobrai.promise.kept")?.[2]).toMatchObject({
      promise_id: "prom1"
    });
  });

  it("considera abiertas las promesas parciales al buscar cuál cerrar", async () => {
    const prisma = partialPrisma();
    await makeService(prisma).handlePaymentConfirmed("org1", {
      debt_id: "debt1",
      amount: 100_000,
      amount_outstanding: 900_000
    });

    expect(prisma.promiseToPay.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["pending", "partial"] }
        })
      })
    );
  });
});

describe("PaymentEventsService — contrato con workflows", () => {
  it("publica payment.applied con el estado ya escrito", async () => {
    const prisma = makePrisma({
      debt: baseDebt({ status: "active", amountOutstanding: 500_000 }),
      promises: []
    });
    await makeService(prisma).handlePaymentConfirmed("org1", {
      debt_id: "debt1",
      amount: 500_000,
      amount_outstanding: 0
    });

    const applied = published(kafka, "cobrai.payment.applied");
    expect(applied?.[2]).toMatchObject({
      debt_id: "debt1",
      amount_outstanding: 0,
      status: "paid_full",
      paid_full: true
    });
  });

  it("anuncia el cambio de estado solo cuando cambia", async () => {
    const prisma = makePrisma({
      debt: baseDebt({ status: "paid_partial", amountOutstanding: 500_000 }),
      promises: []
    });
    await makeService(prisma).handlePaymentConfirmed("org1", {
      debt_id: "debt1",
      amount: 100_000,
      amount_outstanding: 400_000
    });

    expect(published(kafka, "cobrai.debt.status_changed")).toBeUndefined();
  });

  it("ignora el evento sin debt_id", async () => {
    const prisma = makePrisma();
    await makeService(prisma).handlePaymentConfirmed("org1", {});

    expect(prisma.debt.findFirst).not.toHaveBeenCalled();
  });
});
