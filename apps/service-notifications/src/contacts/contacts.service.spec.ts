import { describe, expect, it, vi, beforeEach } from "vitest";
import { ContactsService } from "./contacts.service";

// ---------------------------------------------------------------------------
// Prisma mock factory
// ---------------------------------------------------------------------------
function makePrisma() {
  return {
    debt: {
      findFirst: vi.fn().mockResolvedValue({
        id: "debt1",
        tenantId: "org1",
        amountOutstanding: 500000,
        dueDate: new Date("2026-09-30"),
        strategyId: null,
        aiSegment: "medium",
        externalRef: "EXT-001",
        debtor: {
          id: "debtor1",
          tenantId: "org1",
          name: "Juan Pérez",
          email: "juan@test.com",
          phones: ["+573001234567"],
          whatsappOptIn: true,
          emotionalProfile: null
        }
      }),
      // Agrupación por deudor: sin otras deudas en el portafolio → contacto de deuda única.
      findMany: vi.fn().mockResolvedValue([])
    },
    contact: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "contact1" }),
      update: vi.fn().mockResolvedValue({ id: "contact1", status: "completed" })
    },
    conversation: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "conv1" }),
      update: vi.fn().mockResolvedValue({ id: "conv1" })
    },
    message: {
      create: vi.fn().mockResolvedValue({ id: "msg1" })
    },
    promiseToPay: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0)
    },
    notificationTemplate: {
      findFirst: vi.fn().mockResolvedValue(null)
    },
    emailLayout: {
      findUnique: vi.fn().mockResolvedValue(null)
    }
  };
}

// ---------------------------------------------------------------------------
// Other dependency mocks
// ---------------------------------------------------------------------------
function makeCompliance() {
  return {
    checkBeforeSend: vi.fn().mockResolvedValue({ allowed: true })
  };
}

function makeAudit() {
  return {
    logContactLifecycle: vi.fn().mockResolvedValue(undefined)
  };
}

function makeEmail() {
  return {
    sendTemplate: vi.fn().mockResolvedValue({ message_id: "em1", status: "sent" })
  };
}

function makeSms() {
  return {
    sendSMS: vi.fn().mockResolvedValue({ message_id: "sms1", status: "sent" })
  };
}

function makeWhatsapp() {
  return {
    sendTemplate: vi.fn().mockResolvedValue({ message_id: "wa1", status: "sent" })
  };
}

function makeVoice() {
  return {
    initiateCall: vi.fn().mockResolvedValue({ call_id: "call1", status: "queued" })
  };
}

function makeKafka() {
  return {
    publish: vi.fn().mockResolvedValue(undefined)
  };
}

function makeWaterfall() {
  return {
    nextChannel: vi.fn().mockReturnValue("voice")
  };
}

function makeConfig() {
  return {
    get: vi.fn().mockReturnValue(null)
  };
}

function makeDebtorMemory() {
  return {
    getUnifiedContext: vi.fn().mockResolvedValue({
      debtorHistory: {
        previousContactsCount: 2,
        brokenPromisesCount: 0,
        lastOutcome: "promise_made",
        lastContactDaysAgo: 5,
        preferredChannel: "voice",
        callSummary: null,
        hasPromisePending: false,
        promisedDate: null,
        livingSummary: "Deudor cooperativo, prometió pagar.",
        overallSentiment: "positivo",
        paymentBehavior: "cumplidor"
      },
      emotionalProfile: {
        summary: "Deudor cooperativo, prometió pagar.",
        sentiment: "positivo",
        lastIntent: "promesa_pago",
        paymentBehavior: "cumplidor",
        sentimentScore: 0.7,
        updatedAt: new Date().toISOString(),
        interactionCount: 2
      }
    }),
    refreshMemory: vi.fn().mockResolvedValue(undefined),
    registerPendingDebt: vi.fn().mockResolvedValue(undefined),
    clearPendingDebts: vi.fn().mockResolvedValue(undefined)
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("ContactsService — voice enrichment via DebtorMemoryService", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: ContactsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: ReturnType<typeof makePrisma>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let voice: ReturnType<typeof makeVoice>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let debtorMemory: ReturnType<typeof makeDebtorMemory>;

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = makePrisma();
    voice = makeVoice();
    debtorMemory = makeDebtorMemory();

    service = new ContactsService(
      prisma as never,
      makeCompliance() as never,
      makeAudit() as never,
      makeEmail() as never,
      makeSms() as never,
      makeWhatsapp() as never,
      voice as never,
      makeKafka() as never,
      makeWaterfall() as never,
      makeConfig() as never,
      debtorMemory as never
    );
  });

  it("voice call inyecta perfil_deudor en strategy_context.variables", async () => {
    await service.executeContact("org1", { debt_id: "debt1", channel: "voice" });

    expect(voice.initiateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy_context: expect.objectContaining({
          variables: expect.objectContaining({
            perfil_deudor: "Deudor cooperativo, prometió pagar.",
            sentimiento_previo: "positivo",
            comportamiento_pago: "cumplidor"
          })
        })
      })
    );
  });

  it("voice call con emotionalProfile null usa defaults", async () => {
    debtorMemory.getUnifiedContext.mockResolvedValueOnce({
      debtorHistory: {
        previousContactsCount: 0,
        brokenPromisesCount: 0,
        lastOutcome: null,
        lastContactDaysAgo: null,
        preferredChannel: null,
        callSummary: null,
        hasPromisePending: false,
        promisedDate: null,
        livingSummary: null,
        overallSentiment: null,
        paymentBehavior: null
      },
      emotionalProfile: null
    });

    await service.executeContact("org1", { debt_id: "debt1", channel: "voice" });

    expect(voice.initiateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy_context: expect.objectContaining({
          variables: expect.objectContaining({
            perfil_deudor: "",
            sentimiento_previo: "neutral",
            comportamiento_pago: "desconocido"
          })
        })
      })
    );
  });

  it("voice call conserva las llaves existentes", async () => {
    await service.executeContact("org1", { debt_id: "debt1", channel: "voice" });

    const callArg = voice.initiateCall.mock.calls[0]![0]!;
    const vars = callArg.strategy_context.variables as Record<string, string>;

    expect(vars["es_seguimiento"]).toBeDefined();
    expect(vars["contactos_previos"]).toBeDefined();
    expect(vars["first_message_override"]).toBeDefined();
  });
});

describe("ContactsService — email layout + subject", () => {
  let service: ContactsService;
  let prisma: ReturnType<typeof makePrisma>;
  let email: ReturnType<typeof makeEmail>;

  function build() {
    service = new ContactsService(
      prisma as never,
      makeCompliance() as never,
      makeAudit() as never,
      email as never,
      makeSms() as never,
      makeWhatsapp() as never,
      makeVoice() as never,
      makeKafka() as never,
      makeWaterfall() as never,
      makeConfig() as never,
      makeDebtorMemory() as never
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    email = makeEmail();
    build();
  });

  function sentEmail() {
    return email.sendTemplate.mock.calls[0]![0]! as {
      to: string;
      variables: { body: string; subject: string };
    };
  }

  it("sin layout publicado, envuelve el mensaje en el DEFAULT_EMAIL_LAYOUT (HTML email-safe)", async () => {
    await service.executeContact("org1", { debt_id: "debt1", channel: "email" });

    const { variables } = sentEmail();
    expect(variables.body).toContain("<!DOCTYPE html");
    expect(variables.body).toContain("<table"); // estructura de tablas
    // asunto derivado (sin template)
    expect(variables.subject).toContain("Recordatorio de pago");
  });

  it("usa el shell publicado del tenant (firma incluida)", async () => {
    prisma.emailLayout.findUnique.mockResolvedValue({
      published: {
        blocks: [
          { id: "b", type: "body", props: {} },
          { id: "s", type: "signature", props: {} }
        ],
        settings: {},
        signature: { companyName: "Acme Cobranzas" }
      }
    });

    await service.executeContact("org1", { debt_id: "debt1", channel: "email" });

    const { variables } = sentEmail();
    expect(variables.body).toContain("Acme Cobranzas");
    expect(variables.body).toContain("Ley 1266 de 2008");
  });

  it("usa el subject de la regla con variables sustituidas", async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValue({
      id: "tpl1",
      tenantId: "org1",
      channel: "email",
      subject: "Su saldo con {{empresa}} vence pronto",
      content: "Hola {{nombre}}, debe {{monto}}.",
      isApproved: true,
      language: "es"
    });

    await service.executeContact("org1", { debt_id: "debt1", channel: "email" });

    const { variables } = sentEmail();
    // empresa cae a "CobraAI" porque el mock de debt no trae tenant.name
    expect(variables.subject).toBe("Su saldo con CobraAI vence pronto");
    // el cuerpo de la regla (renderizado) va dentro del shell
    expect(variables.body).toContain("Hola Juan Pérez");
  });

  it("expone referencia y external_ref de la deuda en variables de plantilla", async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValue({
      id: "tpl1",
      tenantId: "org1",
      channel: "email",
      subject: "Recordatorio",
      content: "Su factura {{referencia}} por {{monto}}.",
      isApproved: true,
      language: "es"
    });

    await service.executeContact("org1", { debt_id: "debt1", channel: "email" });

    const { variables } = sentEmail();
    expect(variables.referencia).toBe("EXT-001");
    expect(variables.external_ref).toBe("EXT-001");
    expect(variables.body).toContain("Su factura EXT-001");
  });

  it("agrupa varias deudas del mismo portafolio en un email detallado", async () => {
    prisma.notificationTemplate.findFirst.mockResolvedValue(null);
    prisma.debt.findMany.mockResolvedValue([
      { id: "debt1", amountOutstanding: 500000, currency: "COP", externalRef: "EXT-001", dueDate: new Date("2026-09-30") },
      { id: "debt2", amountOutstanding: 300000, currency: "COP", externalRef: "EXT-002", dueDate: new Date("2026-10-15") },
      { id: "debt3", amountOutstanding: 200000, currency: "COP", externalRef: "EXT-003", dueDate: new Date("2026-11-01") }
    ]);

    await service.executeContact("org1", { debt_id: "debt1", channel: "email" });

    const { variables } = sentEmail();
    expect(variables.es_agrupado).toBe("true");
    expect(variables.cantidad_deudas).toBe("3");
    // total agregado sobrescribe el monto de la deuda individual
    expect(variables.monto).toBe("1000000");
    // el cuerpo detalla cada cuenta
    expect(variables.body).toContain("3 cuentas pendientes");
    expect(variables.body).toContain("EXT-001");
    expect(variables.body).toContain("EXT-002");
    expect(variables.body).toContain("EXT-003");
    // Cada cuenta lleva su etapa de mora en tono neutral (Ley 1266).
    expect(variables.body).toMatch(/\((por vencer|vencida hace \d+ días?)\)/);
  });
});
