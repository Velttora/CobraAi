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
const mockMarkResponse = vi.fn().mockResolvedValue(undefined);
const mockContacts = { markResponse: mockMarkResponse };

const REPLY_DOMAIN = "reply.acme.com";

describe("SendgridInboundHandler", () => {
  let handler: SendgridInboundHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new SendgridInboundHandler(
      mockPrisma as never,
      mockKafka as never,
      mockContacts as never
    );
  });

  it("email normal → deudor encontrado en el tenant del token → guarda mensaje y publica Kafka", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ id: "debtor1", tenantId: "org1" });
    mockConversationFindFirst.mockResolvedValueOnce({ id: "conv1" });

    await handler.handleInbound("org1", REPLY_DOMAIN, {
      from: "Juan Pérez <juan@test.com>",
      to: `abc@${REPLY_DOMAIN}`,
      subject: "Re: Su saldo",
      text: "Puedo pagar el viernes.\n\nEl lun 9 jun, CobraAI escribió:\n> Le recordamos..."
    });

    expect(mockDebtorFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "org1" }) })
    );
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

  it("email dirigido al replyDomain de otro tenant → rechazado sin tocar BD", async () => {
    await handler.handleInbound("org1", REPLY_DOMAIN, {
      from: "juan@test.com",
      to: "abc@reply.otro-tenant.com",
      text: "Hola"
    });

    expect(mockDebtorFindFirst).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("opt-out ('no contactar') → revoca consent email acotado al tenant, NO publica Kafka, NO guarda mensaje", async () => {
    mockDebtorFindMany.mockResolvedValueOnce([{ id: "debtor1" }]);

    await handler.handleInbound("org1", REPLY_DOMAIN, {
      from: "juan@test.com",
      to: `abc@${REPLY_DOMAIN}`,
      text: "no contactar"
    });

    expect(mockDebtorFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "org1" }) })
    );
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
      handler.handleInbound("org1", REPLY_DOMAIN, {
        from: "desconocido@test.com",
        to: `abc@${REPLY_DOMAIN}`,
        text: "Hola"
      })
    ).resolves.toBeUndefined();

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("payload con destino fuera del replyDomain del tenant → rechazado sin tocar BD", async () => {
    await handler.handleInbound("org1", REPLY_DOMAIN, {
      from: "juan@test.com",
      to: "cobro@fogging.org", // no contiene el replyDomain del tenant
      text: "Hola"
    });

    expect(mockDebtorFindFirst).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("sin replyDomain configurado (tenant sin dominio verificado) → todo rechazado", async () => {
    await handler.handleInbound("org1", "", {
      from: "juan@test.com",
      to: "abc@reply.acme.com",
      text: "Hola"
    });

    expect(mockDebtorFindFirst).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("loop prevention: headers con Auto-Submitted → ignorado sin tocar BD", async () => {
    await handler.handleInbound("org1", REPLY_DOMAIN, {
      from: "juan@test.com",
      to: `abc@${REPLY_DOMAIN}`,
      text: "Auto-respuesta",
      headers: "Auto-Submitted: auto"
    });

    expect(mockDebtorFindFirst).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("texto citado limpiado antes de publicar Kafka", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ id: "debtor1", tenantId: "org1" });
    mockConversationFindFirst.mockResolvedValueOnce({ id: "conv1" });

    await handler.handleInbound("org1", REPLY_DOMAIN, {
      from: "juan@test.com",
      to: `abc@${REPLY_DOMAIN}`,
      text: "Pago el viernes.\n\nEl lun 9 jun, CobraAI escribió:\n> Recordatorio..."
    });

    const publishCall = mockPublish.mock.calls[0]?.[2];
    expect(publishCall?.body).toBe("Pago el viernes.");
  });

  it("limpia el formato real de Gmail (CRLF + 'On … wrote:')", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ id: "debtor1", tenantId: "org1" });
    mockConversationFindFirst.mockResolvedValueOnce({ id: "conv1" });

    await handler.handleInbound("org1", REPLY_DOMAIN, {
      from: "Gustavo Moreno <juan@test.com>",
      to: `abc@${REPLY_DOMAIN}`,
      text:
        "Puedo en 25 dias\r\n\r\nOn Tue, Jun 9, 2026, 11:49 AM gustavo moreno <noreply@fogging.org> wrote:\r\n> Le recordamos su saldo pendiente..."
    });

    const publishCall = mockPublish.mock.calls[0]?.[2];
    expect(publishCall?.body).toBe("Puedo en 25 dias");
  });

  it("limpia formato Outlook/Hotmail (separador + De:/Enviado:)", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ id: "debtor1", tenantId: "org1" });
    mockConversationFindFirst.mockResolvedValueOnce({ id: "conv1" });

    await handler.handleInbound("org1", REPLY_DOMAIN, {
      from: "Gustavo <juan@test.com>",
      to: `abc@${REPLY_DOMAIN}`,
      text:
        "Pago la próxima semana\r\n\r\n________________________________\r\nDe: CobraAI <noreply@fogging.org>\r\nEnviado: martes, 9 de junio de 2026 11:49 a. m.\r\nPara: Gustavo\r\nAsunto: Sobre su deuda"
    });

    expect(mockPublish.mock.calls[0]?.[2]?.body).toBe("Pago la próxima semana");
  });

  it("limpia formato Apple Mail ('On …, at …, … wrote:')", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ id: "debtor1", tenantId: "org1" });
    mockConversationFindFirst.mockResolvedValueOnce({ id: "conv1" });

    await handler.handleInbound("org1", REPLY_DOMAIN, {
      from: "Gustavo <juan@test.com>",
      to: `abc@${REPLY_DOMAIN}`,
      text:
        "De acuerdo, gracias\n\nOn Jun 9, 2026, at 11:49 AM, CobraAI <noreply@fogging.org> wrote:\n> Le recordamos..."
    });

    expect(mockPublish.mock.calls[0]?.[2]?.body).toBe("De acuerdo, gracias");
  });

  it("limpia formato '----- Original Message -----' (Yahoo/Outlook clásico)", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ id: "debtor1", tenantId: "org1" });
    mockConversationFindFirst.mockResolvedValueOnce({ id: "conv1" });

    await handler.handleInbound("org1", REPLY_DOMAIN, {
      from: "Gustavo <juan@test.com>",
      to: `abc@${REPLY_DOMAIN}`,
      text:
        "Confirmo el pago\n\n----- Original Message -----\nFrom: CobraAI\nSubject: deuda"
    });

    expect(mockPublish.mock.calls[0]?.[2]?.body).toBe("Confirmo el pago");
  });

  it("conversación no existe → crea nueva con channel=email y status=open", async () => {
    mockDebtorFindFirst.mockResolvedValueOnce({ id: "debtor1", tenantId: "org1" });
    mockConversationFindFirst.mockResolvedValueOnce(null);
    mockConversationCreate.mockResolvedValueOnce({ id: "conv_new" });

    await handler.handleInbound("org1", REPLY_DOMAIN, {
      from: "juan@test.com",
      to: `abc@${REPLY_DOMAIN}`,
      text: "Buen día"
    });

    expect(mockConversationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: "email", status: "open" })
      })
    );
  });

  it("loop prevention: from terminando en @{replyDomain} → ignorado", async () => {
    await handler.handleInbound("org1", REPLY_DOMAIN, {
      from: `system@${REPLY_DOMAIN}`,
      to: `abc@${REPLY_DOMAIN}`,
      text: "Mensaje de sistema"
    });

    expect(mockDebtorFindFirst).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
