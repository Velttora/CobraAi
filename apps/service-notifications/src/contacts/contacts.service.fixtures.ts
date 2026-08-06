import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Prisma mock factory
// ---------------------------------------------------------------------------
export function makePrisma() {
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
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "contact1" }),
      update: vi.fn().mockResolvedValue({ id: "contact1", status: "completed" })
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue(null)
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
export function makeCompliance() {
  return {
    checkBeforeSend: vi.fn().mockResolvedValue({ allowed: true })
  };
}

export function makeAudit() {
  return {
    logContactLifecycle: vi.fn().mockResolvedValue(undefined)
  };
}

export function makeEmail() {
  return {
    sendTemplate: vi.fn().mockResolvedValue({ message_id: "em1", status: "sent" })
  };
}

export function makeSms() {
  return {
    sendSMS: vi.fn().mockResolvedValue({ message_id: "sms1", status: "sent" })
  };
}

export function makeWhatsapp() {
  return {
    sendTemplate: vi.fn().mockResolvedValue({ message_id: "wa1", status: "sent" })
  };
}

export function makeVoice() {
  return {
    initiateCall: vi.fn().mockResolvedValue({ call_id: "call1", status: "queued" })
  };
}

export function makeKafka() {
  return {
    publish: vi.fn().mockResolvedValue(undefined)
  };
}

export function makeWaterfall() {
  return {
    nextChannel: vi.fn().mockReturnValue("voice")
  };
}

export function makeConfig() {
  return {
    get: vi.fn().mockReturnValue(null)
  };
}

export function makeDebtorMemory() {
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

/** Defaults to every channel verified — matches the pre-D-16 world existing tests were written for. */
export function makeIntegrations() {
  return {
    hasVerifiedChannel: vi.fn().mockResolvedValue(true)
  };
}
