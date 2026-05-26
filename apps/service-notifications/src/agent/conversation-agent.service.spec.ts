import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfigService } from "@nestjs/config";
import { ConversationAgentService } from "./conversation-agent.service";

const { mockChatCreate } = vi.hoisted(() => ({
  mockChatCreate: vi.fn()
}));

vi.mock("openai", () => {
  class MockOpenAI {
    chat = { completions: { create: mockChatCreate } };
  }
  return { default: MockOpenAI };
});

const mockDebtorFindFirst = vi.fn();
const mockMessageFindMany = vi.fn();
const mockMessageCreate = vi.fn().mockResolvedValue({ id: "msg1" });
const mockDebtUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
const mockPromiseCreate = vi.fn().mockResolvedValue({ id: "prom1" });
const mockConversationUpdate = vi.fn().mockResolvedValue({});
const mockConsentUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

const mockPrisma = {
  debtor: { findFirst: mockDebtorFindFirst },
  message: { findMany: mockMessageFindMany, create: mockMessageCreate, findFirst: vi.fn().mockResolvedValue(null) },
  debt: { updateMany: mockDebtUpdateMany },
  promiseToPay: { create: mockPromiseCreate, count: vi.fn().mockResolvedValue(0), findFirst: vi.fn().mockResolvedValue(null) },
  conversation: { update: mockConversationUpdate },
  contactConsent: { updateMany: mockConsentUpdateMany },
  contact: { findMany: vi.fn().mockResolvedValue([]) }
};

const mockKafka = { publish: vi.fn().mockResolvedValue(undefined) };
const mockWhatsapp = {
  sendTemplate: vi.fn().mockResolvedValue({ message_id: "wm1", status: "sent" })
};

function makeConfig(): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (key === "OPENAI_API_KEY") return "sk-test";
      throw new Error(`Missing: ${key}`);
    },
    get: (key: string) => {
      const map: Record<string, string> = {
        OPENAI_MODEL: "gpt-4o-mini",
        OPENAI_MAX_TOKENS: "500",
        PAYMENT_LINK_BASE_URL: "http://localhost:3001/pay"
      };
      return map[key] ?? null;
    }
  } as unknown as ConfigService;
}

const baseDebtor = {
  id: "debtor1",
  tenantId: "org1",
  name: "Juan Pérez",
  email: "juan@test.com",
  phones: ["+573001234567"],
  whatsappOptIn: true,
  debts: [
    {
      id: "debt1",
      tenantId: "org1",
      amountOutstanding: 500000,
      currency: "COP",
      dueDate: new Date("2026-06-01"),
      status: "active",
      strategyId: null
    }
  ]
};

const basePayload = {
  debtor_id: "debtor1",
  tenant_id: "org1",
  conversation_id: "conv1",
  phone: "+573001234567",
  body: "Hola, ¿cuánto debo?"
};

function makeAgentResponse(partial: Partial<{
  intent: string; response: string; promise_date: string | null; promise_amount: number | null
}>) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          intent: "unrelated",
          response: "Respuesta de prueba",
          promise_date: null,
          promise_amount: null,
          ...partial
        })
      }
    }]
  };
}

describe("ConversationAgentService", () => {
  let service: ConversationAgentService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDebtorFindFirst.mockResolvedValue(baseDebtor);
    mockMessageFindMany.mockResolvedValue([]);
    mockChatCreate.mockResolvedValue(makeAgentResponse({ intent: "unrelated", response: "Hola, le informamos..." }));

    service = new ConversationAgentService(
      makeConfig(),
      mockPrisma as never,
      mockKafka as never,
      mockWhatsapp as never
    );
  });

  it("intent unrelated → guarda mensaje + envía WA, sin cambiar estado deuda", async () => {
    await service.processInboundMessage(basePayload);

    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: "out", channel: "whatsapp" })
      })
    );
    expect(mockWhatsapp.sendTemplate).toHaveBeenCalled();
    expect(mockDebtUpdateMany).not.toHaveBeenCalled();
  });

  it("intent promise_to_pay → debt.status = promised + PromiseToPay creado + Kafka", async () => {
    mockChatCreate.mockResolvedValueOnce(
      makeAgentResponse({ intent: "promise_to_pay", response: "Gracias, confirmamos.", promise_date: "2026-06-15", promise_amount: 500000 })
    );

    await service.processInboundMessage(basePayload);

    expect(mockDebtUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "promised" } })
    );
    expect(mockPromiseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          debtId: "debt1",
          status: "pending",
          amount: 500000
        })
      })
    );
    expect(mockKafka.publish).toHaveBeenCalledWith(
      "cobrai.debt.promise_registered",
      "org1",
      expect.objectContaining({ debt_id: "debt1" })
    );
  });

  it("intent dispute → debt.status = disputed + Kafka", async () => {
    mockChatCreate.mockResolvedValueOnce(
      makeAgentResponse({ intent: "dispute", response: "Entendemos su situación, revisaremos." })
    );

    await service.processInboundMessage(basePayload);

    expect(mockDebtUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "disputed" } })
    );
    expect(mockKafka.publish).toHaveBeenCalledWith(
      "cobrai.debt.disputed", "org1", expect.any(Object)
    );
  });

  it("intent escalate_human → conversation.status = escalated + Kafka", async () => {
    mockChatCreate.mockResolvedValueOnce(
      makeAgentResponse({ intent: "escalate_human", response: "Le comunico con un agente." })
    );

    await service.processInboundMessage(basePayload);

    expect(mockConversationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "escalated" } })
    );
    expect(mockKafka.publish).toHaveBeenCalledWith(
      "cobrai.escalation.requested", "org1", expect.any(Object)
    );
  });

  it("intent opt_out → consent revocado, NO envía WA", async () => {
    mockChatCreate.mockResolvedValueOnce(
      makeAgentResponse({ intent: "opt_out", response: "" })
    );

    await service.processInboundMessage(basePayload);

    expect(mockConsentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revokedAt: expect.any(Date) } })
    );
    expect(mockWhatsapp.sendTemplate).not.toHaveBeenCalled();
  });

  it("OpenAI lanza excepción → usa fallback response, sin lanzar error", async () => {
    mockChatCreate.mockRejectedValueOnce(new Error("API timeout"));

    await expect(service.processInboundMessage(basePayload)).resolves.toBeUndefined();
    expect(mockMessageCreate).toHaveBeenCalled();
    expect(mockWhatsapp.sendTemplate).toHaveBeenCalled();
  });

  it("sin deuda activa → retorna sin procesar", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ ...baseDebtor, debts: [] });

    await service.processInboundMessage(basePayload);

    expect(mockChatCreate).not.toHaveBeenCalled();
    expect(mockWhatsapp.sendTemplate).not.toHaveBeenCalled();
  });

  it("deudor no encontrado → retorna sin procesar", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce(null);

    await service.processInboundMessage(basePayload);

    expect(mockChatCreate).not.toHaveBeenCalled();
  });

  it("historial de mensajes → incluidos como context en llamada GPT", async () => {
    mockMessageFindMany.mockResolvedValueOnce([
      { id: "m1", direction: "out", content: JSON.stringify({ text: "Le recordamos su saldo." }), sentAt: new Date() },
      { id: "m2", direction: "in", content: JSON.stringify({ text: "¿Puedo pagar en cuotas?" }), sentAt: new Date() }
    ]);

    await service.processInboundMessage(basePayload);

    const callArgs = mockChatCreate.mock.calls[0]?.[0] as { messages: Array<{ role: string }> };
    const roles = callArgs?.messages.map((m) => m.role);
    expect(roles).toContain("assistant");
    expect(roles).toContain("user");
  });
});
