import { vi, describe, it, expect, beforeEach } from "vitest";
import { KafkaConsumerService } from "./kafka.consumer";

const mockProcessInboundMessage = vi.fn().mockResolvedValue(undefined);
const mockHandleContactRequested = vi.fn().mockResolvedValue(undefined);

const mockConfig = { get: vi.fn(() => undefined) };
const mockContacts = { handleContactRequested: mockHandleContactRequested };
const mockAgent = { processInboundMessage: mockProcessInboundMessage };

describe("KafkaConsumerService", () => {
  let consumer: KafkaConsumerService;

  beforeEach(() => {
    vi.clearAllMocks();
    consumer = new KafkaConsumerService(
      mockConfig as never,
      mockContacts as never,
      mockAgent as never
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
