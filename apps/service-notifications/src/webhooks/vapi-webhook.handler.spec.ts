import { describe, expect, it, vi, beforeEach } from "vitest";
import { VapiWebhookHandler, type VapiWebhookPayload } from "./vapi-webhook.handler";

function makePrisma() {
  return {
    contact: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    debt: {
      findFirst: vi.fn().mockResolvedValue({
        debtorId: "debtor-uuid-1",
        amountOutstanding: 1500000,
        debtor: { name: "Gustavo Moreno", phones: ["573233682536"] }
      }),
    },
    conversation: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "conv-uuid-1" }),
    },
    message: {
      create: vi.fn().mockResolvedValue({ id: "msg-uuid-1" }),
    },
  };
}

function makeKafka() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function makePayload(overrides: Partial<VapiWebhookPayload["message"]> = {}): VapiWebhookPayload {
  return {
    message: {
      type: "end-of-call-report",
      call: {
        id: "call-vapi-001",
        status: "ended",
        startedAt: "2026-05-25T10:00:00Z",
        endedAt: "2026-05-25T10:02:30Z",
        metadata: {
          debt_id: "debt-uuid-1",
          tenant_id: "tenant-uuid-1",
          strategy_id: "strategy-uuid-1",
        },
        endedReason: "assistant-ended-call",
      },
      transcript: "Hola, soy Valeria. ¿Hablo con Juan?",
      summary: "El cliente prometió pagar el 1 de junio.",
      analysis: {
        successEvaluation: "true",
      },
      ...overrides,
    },
  };
}

describe("VapiWebhookHandler", () => {
  let handler: VapiWebhookHandler;
  let prisma: ReturnType<typeof makePrisma>;
  let kafka: ReturnType<typeof makeKafka>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    kafka = makeKafka();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whatsapp = { sendTemplate: vi.fn().mockResolvedValue({ message_id: "wa-sid", status: "sent" }) };
    const config = { get: vi.fn().mockReturnValue("http://localhost:3001/pay"), getOrThrow: vi.fn() };
    handler = new VapiWebhookHandler(prisma as any, kafka as any, whatsapp as any, config as any);
  });

  describe("handleEndOfCall", () => {
    it("actualiza contact, guarda transcript y publica Kafka para end-of-call-report completo", async () => {
      await handler.handleEndOfCall(makePayload());

      // Verifica que actualiza el contact
      expect(prisma.contact.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-uuid-1",
            debtId: "debt-uuid-1",
            channel: "voice",
            status: { in: ["in_progress", "scheduled"] },
          }),
          data: expect.objectContaining({
            status: "completed",
            outcome: "promise_made",
            durationSeconds: 150, // 2.5 minutos
          }),
        }),
      );

      // Verifica que crea mensaje de transcript
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "tenant-uuid-1",
            channel: "voice",
            direction: "out",
          }),
        }),
      );

      // Verifica Kafka publicado
      expect(kafka.publish).toHaveBeenCalledWith(
        "cobrai.voice.call_completed",
        "tenant-uuid-1",
        expect.objectContaining({
          call_id: "call-vapi-001",
          debt_id: "debt-uuid-1",
          outcome: "promise_made",
          success: true,
        }),
      );
    });

    it("solo loguea y retorna sin errores cuando falta metadata (sin debt_id)", async () => {
      const payload = makePayload({
        call: {
          id: "call-no-meta",
          status: "ended",
          metadata: undefined, // sin metadata
        },
      });

      await handler.handleEndOfCall(payload);

      expect(prisma.contact.updateMany).not.toHaveBeenCalled();
      expect(kafka.publish).not.toHaveBeenCalled();
    });

    it("mapea endedReason customer-did-not-answer → outcome: no_answer", async () => {
      const payload = makePayload({
        call: {
          id: "call-no-answer",
          status: "ended",
          endedReason: "customer-did-not-answer",
          metadata: { debt_id: "debt-1", tenant_id: "tenant-1" },
        },
        transcript: undefined,
      });

      await handler.handleEndOfCall(payload);

      expect(prisma.contact.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outcome: "no_answer" }),
        }),
      );
    });

    it("mapea successEvaluation: true con assistant-ended-call → outcome: promise_made", async () => {
      const payload = makePayload({
        call: {
          id: "call-promise",
          status: "ended",
          endedReason: "assistant-ended-call",
          metadata: { debt_id: "debt-1", tenant_id: "tenant-1" },
        },
        analysis: { successEvaluation: "true" },
        transcript: undefined,
      });

      await handler.handleEndOfCall(payload);

      expect(prisma.contact.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outcome: "promise_made" }),
        }),
      );
    });

    it("mapea endedReason voicemail → outcome: voicemail", async () => {
      const payload = makePayload({
        call: {
          id: "call-vm",
          status: "ended",
          endedReason: "voicemail",
          metadata: { debt_id: "debt-1", tenant_id: "tenant-1" },
        },
        transcript: undefined,
      });

      await handler.handleEndOfCall(payload);

      expect(prisma.contact.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outcome: "voicemail" }),
        }),
      );
    });

    it("no llama a saveTranscript cuando no hay transcript", async () => {
      const payload = makePayload({
        call: {
          id: "call-no-transcript",
          status: "ended",
          endedReason: "customer-did-not-answer",
          metadata: { debt_id: "debt-1", tenant_id: "tenant-1" },
        },
        transcript: undefined,
      });

      await handler.handleEndOfCall(payload);

      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it("crea conversacion nueva si no existe una previa de voz", async () => {
      prisma.conversation.findFirst.mockResolvedValueOnce(null);

      await handler.handleEndOfCall(makePayload());

      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "tenant-uuid-1",
            channel: "voice",
            status: "closed",
          }),
        }),
      );
    });

    it("reutiliza conversacion existente de voz si ya existe", async () => {
      prisma.conversation.findFirst.mockResolvedValueOnce({ id: "conv-existing" });

      await handler.handleEndOfCall(makePayload());

      expect(prisma.conversation.create).not.toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ conversationId: "conv-existing" }),
        }),
      );
    });
  });
});
