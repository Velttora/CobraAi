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
      })
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
    refreshMemory: vi.fn().mockResolvedValue(undefined)
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
