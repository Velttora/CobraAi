import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { DebtorMemoryService } from "./debtor-memory.service";

// ---------------------------------------------------------------------------
// OpenAI mock — vi.hoisted + vi.mock so the constructor sees the mock class
// ---------------------------------------------------------------------------
const { mockChatCreate } = vi.hoisted(() => ({
  mockChatCreate: vi.fn()
}));

vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: mockChatCreate } };
  }
  return { default: MockOpenAI };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePrisma() {
  return {
    debtor: {
      findFirst: vi.fn().mockResolvedValue({ id: "d1", emotionalProfile: null }),
      update: vi.fn().mockResolvedValue({ id: "d1" })
    },
    contact: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: "c1" })
    },
    conversation: {
      findMany: vi.fn().mockResolvedValue([])
    },
    promiseToPay: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null)
    }
  };
}

function makeConfig(withApiKey = true): ConfigService {
  const map: Record<string, string> = {
    ...(withApiKey ? { OPENAI_API_KEY: "sk-test" } : {}),
    OPENAI_MODEL: "gpt-4o-mini"
  };
  return { get: (k: string) => map[k] ?? null } as unknown as ConfigService;
}

function makeAnalysisResponse(overrides: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            sentiment: "neutral",
            sentimentScore: 0,
            lastIntent: "sin_compromiso",
            paymentBehavior: "desconocido",
            summary: "Primer contacto sin compromiso.",
            ...overrides
          })
        }
      }
    ]
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("DebtorMemoryService", () => {
  let service: DebtorMemoryService;
  let mockPrisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = makePrisma();
    service = new DebtorMemoryService(makeConfig(true), mockPrisma as never);
  });

  // -------------------------------------------------------------------------
  // Test A: refreshMemory with OpenAI key → writes correctly shaped emotionalProfile
  // -------------------------------------------------------------------------
  it("Test A: refreshMemory con OpenAI key → prisma.debtor.update llamado con EmotionalProfile válido", async () => {
    mockChatCreate.mockResolvedValueOnce(
      makeAnalysisResponse({ sentiment: "positivo", sentimentScore: 0.8, lastIntent: "promesa_pago", paymentBehavior: "cumplidor", summary: "Cliente comprometido." })
    );

    await service.refreshMemory("org1", "d1");

    expect(mockPrisma.debtor.update).toHaveBeenCalledOnce();
    const callArg = mockPrisma.debtor.update.mock.calls[0][0] as { data: { emotionalProfile: Record<string, unknown> } };
    const profile = callArg.data.emotionalProfile as Record<string, unknown>;
    expect(profile).toMatchObject({
      sentiment: "positivo",
      sentimentScore: 0.8,
      lastIntent: "promesa_pago",
      paymentBehavior: "cumplidor",
      summary: "Cliente comprometido.",
      interactionCount: expect.any(Number),
      updatedAt: expect.any(String)
    });
  });

  // -------------------------------------------------------------------------
  // Test B: refreshMemory sin API key → heuristic, no LLM call, update still runs
  // -------------------------------------------------------------------------
  it("Test B: refreshMemory sin OPENAI_API_KEY → mockChatCreate NO llamado; debtor.update SI llamado con perfil neutral", async () => {
    service = new DebtorMemoryService(makeConfig(false), mockPrisma as never);

    await service.refreshMemory("org1", "d1");

    expect(mockChatCreate).not.toHaveBeenCalled();
    expect(mockPrisma.debtor.update).toHaveBeenCalledOnce();
    const callArg = mockPrisma.debtor.update.mock.calls[0][0] as { data: { emotionalProfile: Record<string, unknown> } };
    const profile = callArg.data.emotionalProfile as Record<string, unknown>;
    expect(profile).toMatchObject({ sentiment: "neutral", sentimentScore: 0 });
  });

  // -------------------------------------------------------------------------
  // Test C: existing interactionCount=3 → written profile has interactionCount=4
  // -------------------------------------------------------------------------
  it("Test C: perfil existente con interactionCount=3 → written profile interactionCount=4 (incremental)", async () => {
    mockPrisma.debtor.findFirst.mockResolvedValue({
      id: "d1",
      emotionalProfile: {
        summary: "Historial previo.",
        sentiment: "neutral",
        lastIntent: "otro",
        paymentBehavior: "desconocido",
        sentimentScore: 0,
        updatedAt: "2026-06-01T00:00:00.000Z",
        interactionCount: 3
      }
    });
    mockChatCreate.mockResolvedValueOnce(makeAnalysisResponse());

    await service.refreshMemory("org1", "d1");

    const callArg = mockPrisma.debtor.update.mock.calls[0][0] as { data: { emotionalProfile: Record<string, unknown> } };
    expect((callArg.data.emotionalProfile as Record<string, unknown>).interactionCount).toBe(4);
  });

  // -------------------------------------------------------------------------
  // Test D: OpenAI throws → heuristic fallback, refreshMemory resolves (no throw), update called
  // -------------------------------------------------------------------------
  it("Test D: mockChatCreate rechaza → error capturado, fallback heurístico, debtor.update SI llamado", async () => {
    mockChatCreate.mockRejectedValueOnce(new Error("OpenAI timeout"));

    await expect(service.refreshMemory("org1", "d1")).resolves.toBeUndefined();
    expect(mockPrisma.debtor.update).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Test E: contactId provided → contact.update called; omitted → NOT called
  // -------------------------------------------------------------------------
  it("Test E: contactId provisto → contact.update llamado con { id, sentimentScore }", async () => {
    mockChatCreate.mockResolvedValueOnce(makeAnalysisResponse({ sentimentScore: 0.5 }));

    await service.refreshMemory("org1", "d1", "c1");

    expect(mockPrisma.contact.update).toHaveBeenCalledOnce();
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: { sentimentScore: expect.any(Number) }
      })
    );
  });

  it("Test E (sin contactId): contact.update NO llamado cuando contactId omitido", async () => {
    mockChatCreate.mockResolvedValueOnce(makeAnalysisResponse());

    await service.refreshMemory("org1", "d1");

    expect(mockPrisma.contact.update).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test F: getUnifiedContext → returns UnifiedDebtorContext with all 11 fields
  // -------------------------------------------------------------------------
  it("Test F: getUnifiedContext → retorna { debtorHistory, emotionalProfile } con los 11 campos", async () => {
    mockPrisma.debtor.findFirst.mockResolvedValue({
      id: "d1",
      emotionalProfile: {
        summary: "Historial consolidado.",
        sentiment: "positivo",
        lastIntent: "promesa_pago",
        paymentBehavior: "cumplidor",
        sentimentScore: 0.7,
        updatedAt: "2026-06-01T00:00:00.000Z",
        interactionCount: 2
      }
    });

    const result = await service.getUnifiedContext("org1", "d1");

    expect(result).toHaveProperty("debtorHistory");
    expect(result).toHaveProperty("emotionalProfile");
    // existing 8 fields
    expect(result.debtorHistory).toHaveProperty("previousContactsCount");
    expect(result.debtorHistory).toHaveProperty("brokenPromisesCount");
    expect(result.debtorHistory).toHaveProperty("lastOutcome");
    expect(result.debtorHistory).toHaveProperty("lastContactDaysAgo");
    expect(result.debtorHistory).toHaveProperty("preferredChannel");
    expect(result.debtorHistory).toHaveProperty("callSummary");
    expect(result.debtorHistory).toHaveProperty("hasPromisePending");
    expect(result.debtorHistory).toHaveProperty("promisedDate");
    // new 3 fields sourced from emotionalProfile
    expect(result.debtorHistory.livingSummary).toBe("Historial consolidado.");
    expect(result.debtorHistory.overallSentiment).toBe("positivo");
    expect(result.debtorHistory.paymentBehavior).toBe("cumplidor");
    expect(result.emotionalProfile).not.toBeNull();
    expect(result.emotionalProfile?.sentiment).toBe("positivo");
  });

  // -------------------------------------------------------------------------
  // Test G: getUnifiedContext with null emotionalProfile → no crash, neutral defaults
  // -------------------------------------------------------------------------
  it("Test G: getUnifiedContext con emotionalProfile null → retorna sin crash, livingSummary null", async () => {
    mockPrisma.debtor.findFirst.mockResolvedValue({ id: "d1", emotionalProfile: null });

    const result = await service.getUnifiedContext("org1", "d1");

    expect(result.emotionalProfile).toBeNull();
    expect(result.debtorHistory.livingSummary).toBeNull();
    expect(result.debtorHistory.overallSentiment).toBeNull();
    expect(result.debtorHistory.paymentBehavior).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test H: voice message → prefers JSON summary field
  // -------------------------------------------------------------------------
  it("Test H: mensaje de voz con content JSON { transcript, summary } → summary field preferida en interactionText", async () => {
    const voiceContent = JSON.stringify({
      transcript: "Transcripción larga de la llamada que no debería usarse como primera opción.",
      summary: "Resumen corto de la llamada."
    });
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv1",
        channel: "voice",
        messages: [
          {
            id: "msg1",
            direction: "out",
            channel: "voice",
            content: voiceContent,
            sentAt: new Date("2026-06-01T10:00:00Z"),
            deletedAt: null
          }
        ]
      }
    ]);
    mockChatCreate.mockResolvedValueOnce(makeAnalysisResponse());
    mockChatCreate.mockImplementation((args: { messages: Array<{ content: string; role: string }> }) => {
      // Verify that the user message contains the summary, not the transcript
      const userMsg = args.messages.find((m) => m.role === "user");
      if (userMsg && userMsg.content.includes("Transcripción larga")) {
        throw new Error("FAIL: used transcript instead of summary");
      }
      return Promise.resolve(makeAnalysisResponse());
    });

    await expect(service.refreshMemory("org1", "d1")).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test I: malformed emotionalProfile (string) → parseProfile returns null, no crash
  // -------------------------------------------------------------------------
  it("Test I: emotionalProfile malformado (string en lugar de objeto) → parseProfile retorna null sin lanzar", async () => {
    mockPrisma.debtor.findFirst.mockResolvedValue({
      id: "d1",
      emotionalProfile: "esto-no-es-un-objeto"
    });

    const result = await service.getUnifiedContext("org1", "d1");

    expect(result.emotionalProfile).toBeNull();
    expect(result.debtorHistory.livingSummary).toBeNull();
  });
});
