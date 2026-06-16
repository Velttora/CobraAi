import { vi, describe, it, expect, beforeEach } from "vitest";
import { KafkaConsumerService } from "./kafka.consumer";

const mockProcessInboundMessage = vi.fn().mockResolvedValue(undefined);
const mockHandleContactRequested = vi.fn().mockResolvedValue(undefined);

const mockEscalateByWorkflow = vi.fn().mockResolvedValue(undefined);
const mockAddEscalationSystemMessage = vi.fn().mockResolvedValue(undefined);

const mockConfig = { get: vi.fn(() => undefined) };
const mockContacts = { handleContactRequested: mockHandleContactRequested };
const mockCoordinator = { handleQueuedRequest: vi.fn().mockResolvedValue(undefined) };
const mockAgent = { processInboundMessage: mockProcessInboundMessage };
const mockConversations = {
  escalateByWorkflow: mockEscalateByWorkflow,
  addEscalationSystemMessage: mockAddEscalationSystemMessage
};

describe("KafkaConsumerService", () => {
  let consumer: KafkaConsumerService;

  beforeEach(() => {
    vi.clearAllMocks();
    consumer = new KafkaConsumerService(
      mockConfig as never,
      mockContacts as never,
      mockCoordinator as never,
      mockAgent as never,
      mockConversations as never
    );
  });

  it("dispatch cobrai.email.message_received → llama agent.processInboundMessage con channel email", async () => {
    const envelope = {
      tenant_id: "org1",
      payload: {
        debtor_id: "debtor1",
        tenant_id: "org1",
        conversation_id: "conv1",
        phone: "juan@test.com",
        body: "Hola",
        channel: "email"
      }
    };

    await (
      consumer as unknown as {
        dispatch(topic: string, envelope: unknown): Promise<void>;
      }
    ).dispatch("cobrai.email.message_received", envelope);

    expect(mockAgent.processInboundMessage).toHaveBeenCalledOnce();
    expect(mockAgent.processInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ debtor_id: "debtor1", channel: "email" })
    );
  });

  it("dispatch cobrai.debt.escalated target=human → escala la conversación a la bandeja", async () => {
    const envelope = {
      tenant_id: "org1",
      payload: {
        debt_id: "debt1",
        rule_name: "Mora > 30 días",
        target: "human"
      }
    };

    await (
      consumer as unknown as {
        dispatch(topic: string, envelope: unknown): Promise<void>;
      }
    ).dispatch("cobrai.debt.escalated", envelope);

    expect(mockEscalateByWorkflow).toHaveBeenCalledOnce();
    expect(mockEscalateByWorkflow).toHaveBeenCalledWith(
      "org1",
      "debt1",
      "Mora > 30 días"
    );
  });

  it("dispatch cobrai.debt.escalated target=legal → NO crea entrada en la bandeja", async () => {
    const envelope = {
      tenant_id: "org1",
      payload: { debt_id: "debt2", rule_name: "Legal", target: "legal" }
    };

    await (
      consumer as unknown as {
        dispatch(topic: string, envelope: unknown): Promise<void>;
      }
    ).dispatch("cobrai.debt.escalated", envelope);

    expect(mockEscalateByWorkflow).not.toHaveBeenCalled();
  });

  it("dispatch cobrai.whatsapp.message_received → sigue llamando agent.processInboundMessage (anti-regresión)", async () => {
    const envelope = {
      tenant_id: "org1",
      payload: {
        debtor_id: "debtor2",
        tenant_id: "org1",
        conversation_id: "conv2",
        phone: "+573001234567",
        body: "Cuánto debo?",
        channel: "whatsapp"
      }
    };

    await (
      consumer as unknown as {
        dispatch(topic: string, envelope: unknown): Promise<void>;
      }
    ).dispatch("cobrai.whatsapp.message_received", envelope);

    expect(mockAgent.processInboundMessage).toHaveBeenCalledOnce();
    expect(mockAgent.processInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ debtor_id: "debtor2", channel: "whatsapp" })
    );
  });
});
