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
        debtor: {
          id: "debtor-uuid-1",
          name: "Gustavo Moreno",
          phones: ["573233682536"],
          email: "gustavo@example.com",
          bestChannel: null,
        }
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    promiseToPay: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "promise-uuid-1" }),
      update: vi.fn().mockResolvedValue({ id: "promise-uuid-1" }),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let whatsapp: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let email: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let compliance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    kafka = makeKafka();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    whatsapp = { sendTemplate: vi.fn().mockResolvedValue({ message_id: "wa-sid", status: "sent" }) };
    email = { sendTemplate: vi.fn().mockResolvedValue({ message_id: "email-sid", status: "sent" }) };
    // Por defecto todos los canales habilitados; cada test puede sobreescribir.
    compliance = { isChannelEligible: vi.fn().mockResolvedValue({ allowed: true }) };
    const config = { get: vi.fn().mockReturnValue("http://localhost:3001/pay"), getOrThrow: vi.fn() };
    handler = new VapiWebhookHandler(
      prisma as any,
      kafka as any,
      whatsapp as any,
      email as any,
      compliance as any,
      config as any,
    );
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

    it("registra promesa aunque el cliente cuelgue, si structuredData.promised es true", async () => {
      // Caso real: el deudor dice 'el siguiente mes' y luego cuelga él mismo.
      // structuredData manda sobre el endedReason → debe ser promise_made.
      const payload = makePayload({
        call: {
          id: "call-promise-hangup",
          status: "ended",
          startedAt: "2026-05-25T10:00:00Z",
          endedAt: "2026-05-25T10:02:30Z",
          endedReason: "customer-ended-call",
          metadata: { debt_id: "debt-uuid-1", tenant_id: "tenant-uuid-1" },
        },
        analysis: {
          successEvaluation: "false",
          structuredData: {
            intent: "promise_to_pay",
            promised: true,
            promise_date: "2099-07-09",
            promise_timeframe_text: "el siguiente mes",
            promise_amount: 0,
          },
        },
        transcript: undefined,
      });

      await handler.handleEndOfCall(payload);

      // Outcome es promise_made pese a customer-ended-call
      expect(prisma.contact.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outcome: "promise_made" }),
        }),
      );

      // Crea la promesa con la fecha calculada y el saldo total (promise_amount era 0)
      expect(prisma.promiseToPay.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "tenant-uuid-1",
            debtId: "debt-uuid-1",
            amount: 1500000,
            status: "pending",
          }),
        }),
      );

      // Fecha exacta (Vapi la calculó): notes guarda el texto literal sin marca de revisión
      const promiseData = prisma.promiseToPay.create.mock.calls[0]?.[0]?.data;
      expect(promiseData?.notes).toContain("el siguiente mes");
      expect(promiseData?.notes).not.toContain("revisar");

      // Marca la deuda como promised
      expect(prisma.debt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "promised" }),
        }),
      );

      // Publica el evento de promesa
      expect(kafka.publish).toHaveBeenCalledWith(
        "cobrai.debt.promise_registered",
        "tenant-uuid-1",
        expect.objectContaining({
          debt_id: "debt-uuid-1",
          channel: "voice",
          promise_date: "2099-07-09",
        }),
      );
    });

    it("entrega el link por WhatsApp cuando está habilitado", async () => {
      await handler.handleEndOfCall(makePayload());

      expect(compliance.isChannelEligible).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "whatsapp", debtorId: "debtor-uuid-1" }),
      );
      expect(whatsapp.sendTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ to: "+573233682536", template_id: "link_pago" }),
      );
      expect(email.sendTemplate).not.toHaveBeenCalled();
    });

    it("usa email como alterno cuando WhatsApp no está habilitado", async () => {
      // WhatsApp no elegible (sin opt-in), email sí.
      compliance.isChannelEligible.mockImplementation(
        async ({ channel }: { channel: string }) =>
          channel === "whatsapp"
            ? { allowed: false, reason: "whatsapp_not_opted_in" }
            : { allowed: true },
      );

      await handler.handleEndOfCall(makePayload());

      expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
      expect(email.sendTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ to: "gustavo@example.com", template_id: "link_pago" }),
      );
    });

    it("publica delivery_failed cuando ningún canal está habilitado", async () => {
      compliance.isChannelEligible.mockResolvedValue({ allowed: false, reason: "opt_out_global" });

      await handler.handleEndOfCall(makePayload());

      expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
      expect(email.sendTemplate).not.toHaveBeenCalled();
      expect(kafka.publish).toHaveBeenCalledWith(
        "cobrai.payment_link.delivery_failed",
        "tenant-uuid-1",
        expect.objectContaining({ debt_id: "debt-uuid-1", reason: "no_eligible_channel" }),
      );
    });

    it("cae a +1 mes cuando promise_date es invalida o pasada", async () => {
      const payload = makePayload({
        call: {
          id: "call-bad-date",
          status: "ended",
          startedAt: "2026-05-25T10:00:00Z",
          endedAt: "2026-05-25T10:02:30Z",
          endedReason: "assistant-ended-call",
          metadata: { debt_id: "debt-uuid-1", tenant_id: "tenant-uuid-1" },
        },
        analysis: {
          successEvaluation: "true",
          structuredData: {
            intent: "promise_to_pay",
            promised: true,
            promise_date: "", // Vapi no pudo calcular
            promise_timeframe_text: "el siguiente mes",
            promise_amount: 500000,
          },
        },
        transcript: undefined,
      });

      await handler.handleEndOfCall(payload);

      const createCall = prisma.promiseToPay.create.mock.calls[0]?.[0];
      expect(createCall?.data?.amount).toBe(500000);
      // La fecha debe ser futura (fallback +1 mes), no vacía
      expect(createCall?.data?.promisedDate).toBeInstanceOf(Date);
      expect(createCall?.data?.promisedDate.getTime()).toBeGreaterThan(Date.now());
      // Fecha estimada: notes guarda el texto literal y lo marca para revisión
      expect(createCall?.data?.notes).toContain("el siguiente mes");
      expect(createCall?.data?.notes).toContain("revisar");
    });
  });
});
