import { vi, describe, it, expect, beforeEach } from "vitest";
import { SendgridInboundHandler } from "./sendgrid-inbound.handler";

const mockPublish = vi.fn().mockResolvedValue(undefined);
const mockDebtorFindFirst = vi.fn();
const mockDebtorFindMany = vi.fn();
const mockMessageCreate = vi.fn().mockResolvedValue({ id: "msg1" });
const mockConversationFindFirst = vi.fn();
const mockConversationCreate = vi.fn().mockResolvedValue({ id: "conv1" });
const mockConversationUpdate = vi.fn().mockResolvedValue({});
const mockConsentUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

const mockPrisma = {
  debtor: {
    findFirst: mockDebtorFindFirst,
    findMany: mockDebtorFindMany
  },
  message: { create: mockMessageCreate },
  conversation: {
    findFirst: mockConversationFindFirst,
    create: mockConversationCreate,
    update: mockConversationUpdate
  },
  contactConsent: { updateMany: mockConsentUpdateMany }
};

const mockKafka = { publish: mockPublish };

describe("SendgridInboundHandler", () => {
  let handler: SendgridInboundHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new SendgridInboundHandler(
      mockPrisma as never,
      mockKafka as never
    );
  });

  it("email normal → deudor encontrado → guarda mensaje y publica Kafka", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ id: "debtor1", tenantId: "org1" });
    mockConversationFindFirst.mockResolvedValueOnce({ id: "conv1" });

    await handler.handleInbound({
      from: "Juan Pérez <juan@test.com>",
      to: "abc@reply.fogging.org",
      subject: "Re: Su saldo",
      text: "Puedo pagar el viernes.\n\nEl lun 9 jun, CobraAI escribió:\n> Le recordamos..."
    });

    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: "in", channel: "email" })
      })
    );
    expect(mockPublish).toHaveBeenCalledWith(
      "cobrai.email.message_received",
      "org1",
      expect.objectContaining({ debtor_id: "debtor1", channel: "email" })
    );
  });

  it("opt-out ('no contactar') → revoca consent email, NO publica Kafka, NO guarda mensaje", async () => {
    mockDebtorFindMany.mockResolvedValueOnce([{ id: "debtor1" }]);

    await handler.handleInbound({
      from: "juan@test.com",
      to: "abc@reply.fogging.org",
      text: "no contactar"
    });

    expect(mockConsentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ channel: "email" })
      })
    );
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it("deudor no encontrado → solo log, sin Kafka", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce(null);

    await expect(
      handler.handleInbound({
        from: "desconocido@test.com",
        to: "abc@reply.fogging.org",
        text: "Hola"
      })
    ).resolves.toBeUndefined();

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("payload con destino fuera de reply.fogging.org → rechazado sin tocar BD", async () => {
    await handler.handleInbound({
      from: "juan@test.com",
      to: "cobro@fogging.org", // no contiene reply.fogging.org
      text: "Hola"
    });

    expect(mockDebtorFindFirst).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("loop prevention: headers con Auto-Submitted → ignorado sin tocar BD", async () => {
    await handler.handleInbound({
      from: "juan@test.com",
      to: "abc@reply.fogging.org",
      text: "Auto-respuesta",
      headers: "Auto-Submitted: auto"
    });

    expect(mockDebtorFindFirst).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("texto citado limpiado antes de publicar Kafka", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ id: "debtor1", tenantId: "org1" });
    mockConversationFindFirst.mockResolvedValueOnce({ id: "conv1" });

    await handler.handleInbound({
      from: "juan@test.com",
      to: "abc@reply.fogging.org",
      text: "Pago el viernes.\n\nEl lun 9 jun, CobraAI escribió:\n> Recordatorio..."
    });

    const publishCall = mockPublish.mock.calls[0]?.[2];
    expect(publishCall?.body).toBe("Pago el viernes.");
  });

  it("conversación no existe → crea nueva con channel=email y status=open", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ id: "debtor1", tenantId: "org1" });
    mockConversationFindFirst.mockResolvedValueOnce(null);
    mockConversationCreate.mockResolvedValueOnce({ id: "conv_new" });

    await handler.handleInbound({
      from: "juan@test.com",
      to: "abc@reply.fogging.org",
      text: "Buen día"
    });

    expect(mockConversationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: "email", status: "open" })
      })
    );
  });

  it("loop prevention: from terminando en @reply.fogging.org → ignorado", async () => {
    await handler.handleInbound({
      from: "system@reply.fogging.org",
      to: "abc@reply.fogging.org",
      text: "Mensaje de sistema"
    });

    expect(mockDebtorFindFirst).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
