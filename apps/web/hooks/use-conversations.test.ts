import { describe, it, expect } from "vitest";

// Tipos exportados por use-conversations — smoke tests sin hooks
// (los hooks usan React Query que necesita jsdom; aquí solo verificamos tipos y lógica)

import type {
  ConversationItem,
  ConversationMessage,
  ConversationThread
} from "./use-conversations";

describe("use-conversations types", () => {
  it("ConversationItem shape", () => {
    const item: ConversationItem = {
      id: "conv1",
      channel: "whatsapp",
      status: "escalated",
      last_message_at: "2026-05-25T10:00:00Z",
      debtor: { id: "d1", name: "Juan" },
      portfolio: null,
      last_message: "Hola",
      last_call_outcome: null,
      last_call_duration: null
    };
    expect(item.status).toBe("escalated");
    expect(item.debtor.name).toBe("Juan");
  });

  it("ConversationMessage direction typing", () => {
    const msg: ConversationMessage = {
      id: "m1",
      direction: "in",
      channel: "whatsapp",
      text: "¿Puedo pagar en cuotas?",
      voice: null,
      human_sent: false,
      status: "delivered",
      sent_at: "2026-05-25T10:00:00Z"
    };
    expect(msg.direction).toBe("in");
    expect(msg.human_sent).toBe(false);
  });

  it("ConversationThread aggregates messages", () => {
    const thread: ConversationThread = {
      total: 2,
      page: 1,
      limit: 50,
      conversation_id: "conv1",
      channel: "whatsapp",
      status: "open",
      messages: [
        {
          id: "m1",
          direction: "out",
          channel: "whatsapp",
          text: "Le recordamos su saldo.",
          voice: null,
          human_sent: false,
          status: "sent",
          sent_at: "2026-05-24T08:00:00Z"
        },
        {
          id: "m2",
          direction: "in",
          channel: "whatsapp",
          text: "¿Cuánto debo?",
          voice: null,
          human_sent: false,
          status: "received",
          sent_at: "2026-05-24T08:01:00Z"
        }
      ]
    };
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[0]?.direction).toBe("out");
    expect(thread.messages[1]?.direction).toBe("in");
  });
});
