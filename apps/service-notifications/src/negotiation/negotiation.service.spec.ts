import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NegotiationService } from "./negotiation.service";

const NOW = new Date("2026-03-10T14:30:00.000Z");
const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

function makeDebt(overrides: Record<string, unknown> = {}) {
  return {
    id: "debt1",
    debtorId: "debtor1",
    externalRef: "FAC-001",
    amountOutstanding: 1_200_000,
    currency: "COP",
    aiSegment: "high",
    agingBucket: "d31_60",
    dueDate: d("2026-01-15"),
    portfolioId: "port1",
    portfolio: { id: "port1", name: "Cartera Enero" },
    debtor: { id: "debtor1", name: "Juan Pérez" },
    ...overrides
  };
}

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan1",
    debtId: "debt1",
    totalAmount: 900_000,
    installmentsCount: 3,
    status: "active",
    createdVia: "whatsapp",
    notes: "Acordado por WhatsApp",
    createdAt: d("2026-01-20"),
    updatedAt: d("2026-02-05"),
    debt: makeDebt(),
    installments: [
      {
        status: "kept",
        amount: 300_000,
        amountPaid: 300_000,
        promisedDate: d("2026-02-01")
      },
      {
        status: "pending",
        amount: 300_000,
        amountPaid: 0,
        promisedDate: d("2026-03-01")
      },
      {
        status: "pending",
        amount: 300_000,
        amountPaid: 0,
        promisedDate: d("2026-04-01")
      }
    ],
    ...overrides
  };
}

function makePromise(overrides: Record<string, unknown> = {}) {
  return {
    id: "prom1",
    debtId: "debt2",
    amount: 450_000,
    amountPaid: 0,
    promisedDate: d("2026-03-20"),
    status: "pending",
    notes: null,
    createdAt: d("2026-03-05"),
    updatedAt: d("2026-03-05"),
    debt: makeDebt({ id: "debt2", debtorId: "debtor2", externalRef: "FAC-002" }),
    contact: { channel: "voice" },
    ...overrides
  };
}

function makePrisma(
  data: {
    plans?: unknown[];
    promises?: unknown[];
    conversations?: unknown[];
    pendingApprovals?: unknown[];
  } = {}
) {
  return {
    paymentPlan: {
      findMany: vi.fn().mockResolvedValue(data.plans ?? [])
    },
    promiseToPay: {
      findMany: vi.fn().mockResolvedValue(data.promises ?? [])
    },
    conversation: {
      findMany: vi.fn().mockResolvedValue(data.conversations ?? [])
    },
    debt: {
      findFirst: vi.fn().mockResolvedValue({
        id: "debt1",
        debtorId: "debtor1",
        amountOutstanding: 1_200_000
      }),
      updateMany: vi.fn().mockResolvedValue({})
    },
    negotiation: {
      findMany: vi.fn().mockResolvedValue(data.pendingApprovals ?? []),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "neg1" }),
      update: vi.fn().mockResolvedValue({})
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) }
  };
}

/** El plan solo se materializa al aprobar, así que acá basta con espiarlo. */
function makePaymentPlans() {
  return { createPlan: vi.fn().mockResolvedValue("plan-nuevo") };
}

let paymentPlans: ReturnType<typeof makePaymentPlans>;

function makeService(prisma: ReturnType<typeof makePrisma>): NegotiationService {
  paymentPlans = makePaymentPlans();
  return new NegotiationService(prisma as never, paymentPlans as never);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NegotiationService.list", () => {
  it("proyecta un plan en cuotas con su avance y su mora", async () => {
    const service = makeService(makePrisma({ plans: [makePlan()] }));

    const [item] = await service.list("org1");

    expect(item?.id).toBe("plan:plan1");
    expect(item?.source).toBe("direct_plan");
    // Cuota del 1 de marzo sin pagar: el plan sigue `active` pero está en mora.
    expect(item?.commitment_state).toBe("overdue");
    expect(item?.status).toBe("agreed");
    expect(item?.offer_settlement_amount).toBe(900_000);
    expect(item?.offer_installments).toBe(3);
    expect(item?.installments_paid).toBe(1);
    expect(item?.amount_paid).toBe(300_000);
    expect(item?.due_date).toBe(d("2026-03-01").toISOString());
    expect(item?.days_overdue).toBe(9);
    expect(item?.channel).toBe("whatsapp");
    expect(item?.debtor_name).toBe("Juan Pérez");
    expect(item?.portfolio_name).toBe("Cartera Enero");
  });

  it("proyecta una promesa suelta con su fecha pactada", async () => {
    const service = makeService(makePrisma({ promises: [makePromise()] }));

    const [item] = await service.list("org1");

    expect(item?.id).toBe("promise:prom1");
    expect(item?.source).toBe("direct_promise");
    expect(item?.commitment_state).toBe("pending");
    expect(item?.offer_installments).toBe(1);
    expect(item?.amount_paid).toBe(0);
    expect(item?.days_overdue).toBe(-10);
    // El canal sale del contacto que la generó.
    expect(item?.channel).toBe("voice");
  });

  it("excluye las cuotas de un plan del listado de promesas sueltas", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await service.list("org1");

    expect(prisma.promiseToPay.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ planId: null })
      })
    );
  });

  it("filtra por estado real, no por el estado guardado", async () => {
    const prisma = makePrisma({
      plans: [makePlan()],
      promises: [makePromise()]
    });
    const service = makeService(prisma);

    const overdue = await service.list("org1", { status: "overdue" });
    const pending = await service.list("org1", { status: "pending" });

    // El plan sigue `active` en base pero tiene una cuota vencida.
    expect(overdue.map((i) => i.id)).toEqual(["plan:plan1"]);
    expect(pending.map((i) => i.id)).toEqual(["promise:prom1"]);
  });

  it("pone primero lo vencido y dentro de eso lo más atrasado", async () => {
    const service = makeService(
      makePrisma({
        plans: [makePlan()],
        promises: [
          makePromise({ id: "prom-kept", status: "kept" }),
          makePromise({
            id: "prom-vieja",
            promisedDate: d("2026-01-05"),
            status: "pending"
          })
        ]
      })
    );

    const items = await service.list("org1");

    expect(items.map((i) => i.id)).toEqual([
      "promise:prom-vieja",
      "plan:plan1",
      "promise:prom-kept"
    ]);
  });

  it("no consulta planes cuando se piden solo promesas", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    await service.list("org1", { type: "direct_promise" });

    expect(prisma.paymentPlan.findMany).not.toHaveBeenCalled();
    expect(prisma.promiseToPay.findMany).toHaveBeenCalled();
  });

  it("cuelga la conversación del deudor con el último mensaje", async () => {
    const service = makeService(
      makePrisma({
        promises: [makePromise()],
        conversations: [
          {
            id: "conv1",
            debtId: "debt2",
            debtorId: "debtor2",
            channel: "whatsapp",
            lastMessageAt: d("2026-03-06"),
            messages: [
              {
                direction: "in",
                content: JSON.stringify({ text: "Pago el viernes sin falta" })
              }
            ]
          }
        ]
      })
    );

    const [item] = await service.list("org1");

    expect(item?.conversation_id).toBe("conv1");
    expect(item?.conversation?.last_message_direction).toBe("in");
    expect(item?.conversation?.last_message_preview).toBe(
      "Pago el viernes sin falta"
    );
  });

  it("cae al hilo del deudor cuando la conversación no apunta a la deuda", async () => {
    const service = makeService(
      makePrisma({
        promises: [makePromise()],
        conversations: [
          {
            id: "conv-deudor",
            debtId: null,
            debtorId: "debtor2",
            channel: "email",
            lastMessageAt: d("2026-03-04"),
            messages: []
          }
        ]
      })
    );

    const [item] = await service.list("org1");

    expect(item?.conversation_id).toBe("conv-deudor");
    expect(item?.conversation?.last_message_preview).toBeNull();
  });
});

describe("NegotiationService.summary", () => {
  it("agrega montos y cumplimiento sobre lo ya juzgable", async () => {
    const service = makeService(
      makePrisma({
        plans: [makePlan()],
        promises: [
          makePromise({
            id: "p-kept",
            status: "kept",
            amount: 200_000,
            amountPaid: 200_000
          }),
          makePromise({ id: "p-broken", status: "broken", amount: 100_000 }),
          makePromise({ id: "p-viva", amount: 450_000 })
        ]
      })
    );

    const summary = await service.summary("org1");

    expect(summary.total).toBe(4);
    expect(summary.overdue).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.kept).toBe(1);
    expect(summary.broken).toBe(1);
    expect(summary.committed_amount).toBe(900_000 + 200_000 + 100_000 + 450_000);
    expect(summary.paid_amount).toBe(300_000 + 200_000);
    expect(summary.overdue_amount).toBe(900_000);
    // 1 cumplida sobre 3 juzgables (cumplida + incumplida + vencida).
    expect(summary.keep_rate).toBe(33);
  });

  it("ignora el filtro de estado para que el encabezado no se recorte", async () => {
    const service = makeService(
      makePrisma({ plans: [makePlan()], promises: [makePromise()] })
    );

    const summary = await service.summary("org1", { status: "kept" });

    expect(summary.total).toBe(2);
  });

  it("deja el cumplimiento en null cuando nada ha vencido todavía", async () => {
    const service = makeService(makePrisma({ promises: [makePromise()] }));

    const summary = await service.summary("org1");

    expect(summary.keep_rate).toBeNull();
  });
});

describe("NegotiationService — aprobación humana", () => {
  const proposal = [
    { installmentNumber: 1, amount: 300_000, dueDate: "2026-04-01" },
    { installmentNumber: 2, amount: 300_000, dueDate: "2026-05-01" }
  ];

  function pendingRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "neg1",
      debtId: "debt1",
      status: "escalated",
      channel: "whatsapp",
      planId: null,
      offerSettlementAmount: 600_000,
      offerInstallments: 2,
      offerDiscountPct: 50,
      createdAt: d("2026-03-08"),
      updatedAt: d("2026-03-08"),
      history: [
        {
          at: "2026-03-08T00:00:00.000Z",
          decision: "approval_requested",
          kind: "payment_plan",
          installments: [
            { installment_number: 1, amount: 300_000, due_date: "2026-04-01" },
            { installment_number: 2, amount: 300_000, due_date: "2026-05-01" }
          ],
          notes: null
        }
      ],
      ...overrides
    };
  }

  it("proponer no crea el plan: solo lo deja esperando", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    const id = await service.requestApproval({
      tenantId: "org1",
      debtId: "debt1",
      kind: "payment_plan",
      installments: proposal
    });

    expect(id).toBe("neg1");
    expect(paymentPlans.createPlan).not.toHaveBeenCalled();
    expect(prisma.negotiation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "escalated",
          offerSettlementAmount: 600_000,
          offerInstallments: 2
        })
      })
    );
  });

  it("una propuesta con una sola cuota no es un acuerdo", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    const id = await service.requestApproval({
      tenantId: "org1",
      debtId: "debt1",
      kind: "payment_plan",
      installments: [proposal[0]!]
    });

    expect(id).toBeNull();
    expect(prisma.negotiation.create).not.toHaveBeenCalled();
  });

  it("aprobar materializa el plan con los términos guardados", async () => {
    const prisma = makePrisma();
    prisma.negotiation.findFirst.mockResolvedValue(pendingRow());
    const service = makeService(prisma);

    const result = await service.approve("org1", "neg1", "user_42", "admin");

    // Se ejecuta el calendario tal como se aprobó, sin recalcular.
    expect(paymentPlans.createPlan).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ debtId: "debt1", installments: proposal })
    );
    expect(result).toEqual({
      negotiation_id: "neg1",
      plan_id: "plan-nuevo",
      status: "agreed"
    });
  });

  it("aprobar deja firmado quién aprobó", async () => {
    const prisma = makePrisma();
    prisma.negotiation.findFirst.mockResolvedValue(pendingRow());
    await makeService(prisma).approve("org1", "neg1", "user_42", "admin");

    const history = prisma.negotiation.update.mock.calls[0]?.[0].data.history;
    expect(history.at(-1)).toMatchObject({
      decision: "approved",
      approved_by: "user_42"
    });
  });

  it("rechazar no materializa nada", async () => {
    const prisma = makePrisma();
    prisma.negotiation.findFirst.mockResolvedValue(pendingRow());
    const service = makeService(prisma);

    await service.reject("org1", "neg1", { reason: "descuento excesivo", rejectedBy: "user_42", role: "admin" });

    expect(paymentPlans.createPlan).not.toHaveBeenCalled();
    expect(prisma.negotiation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "rejected" })
      })
    );
  });

  it("aprobar un remanente condona con el humano detrás", async () => {
    const prisma = makePrisma();
    prisma.negotiation.findFirst.mockResolvedValue(
      pendingRow({
        planId: "plan1",
        offerSettlementAmount: 200_000,
        history: [
          {
            at: "2026-03-08T00:00:00.000Z",
            decision: "approval_requested",
            kind: "settlement_remainder",
            installments: []
          }
        ]
      })
    );
    const service = makeService(prisma);

    await service.approve("org1", "neg1", "user_42", "admin");

    expect(prisma.debt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { amountOutstanding: 0, status: "paid_full" }
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "debt.balance_forgiven",
          userId: "user_42"
        })
      })
    );
  });

  it("rechazar un remanente devuelve la deuda a cobranza", async () => {
    const prisma = makePrisma();
    prisma.negotiation.findFirst.mockResolvedValue(
      pendingRow({
        history: [
          { at: "x", decision: "approval_requested", kind: "settlement_remainder" }
        ]
      })
    );
    await makeService(prisma).reject("org1", "neg1", { rejectedBy: "user_42", role: "admin" });

    expect(prisma.debt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "active" } })
    );
  });

  it("no se puede aprobar dos veces", async () => {
    const prisma = makePrisma();
    prisma.negotiation.findFirst.mockResolvedValue(pendingRow({ status: "agreed" }));

    await expect(makeService(prisma).approve("org1", "neg1", undefined, "admin")).rejects.toThrow(
      "ya fue resuelto"
    );
  });

  // Aprobar condona deuda o compromete al tenant con un plan de pago. Sin esta
  // compuerta cualquier usuario autenticado del tenant podía hacerlo, y el proxy
  // del api-gateway es genérico: no valida roles por ruta.
  it.each(["viewer", "agent", "org:viewer", undefined])(
    "un rol %s no puede aprobar un acuerdo",
    async (role) => {
      const prisma = makePrisma();

      await expect(
        makeService(prisma).approve("org1", "neg1", "user_42", role)
      ).rejects.toThrow("Solo administradores");

      // La denegación ocurre antes de cualquier lectura o efecto.
      expect(prisma.negotiation.findFirst).not.toHaveBeenCalled();
    }
  );

  it.each(["viewer", "agent", undefined])(
    "un rol %s tampoco puede rechazar un acuerdo",
    async (role) => {
      const prisma = makePrisma();

      await expect(
        makeService(prisma).reject("org1", "neg1", { rejectedBy: "user_42", role })
      ).rejects.toThrow("Solo administradores");
      expect(prisma.negotiation.findFirst).not.toHaveBeenCalled();
    }
  );

  it("los pendientes encabezan la bandeja", async () => {
    const prisma = makePrisma({
      plans: [makePlan()],
      pendingApprovals: [{ ...pendingRow(), debt: makeDebt() }]
    });

    const items = await makeService(prisma).list("org1");

    expect(items[0]?.id).toBe("neg1");
    expect(items[0]?.commitment_state).toBe("awaiting_approval");
    expect(items[0]?.approval_kind).toBe("payment_plan");
  });
});
