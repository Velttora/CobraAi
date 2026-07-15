import { vi, describe, it, expect, beforeEach } from "vitest";
import { TwilioWaWebhookHandler } from "./twilio-wa-webhook.handler";

const mockPublish = vi.fn().mockResolvedValue(undefined);
const mockQueryRaw = vi.fn();
const mockMessageCreate = vi.fn().mockResolvedValue({ id: "msg1" });
const mockConversationFindFirst = vi.fn();
const mockConversationCreate = vi.fn().mockResolvedValue({ id: "conv1" });
const mockConversationUpdate = vi.fn().mockResolvedValue({});
const mockConsentUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
const mockDebtorFindUnique = vi.fn();

const mockPrisma = {
  $queryRaw: mockQueryRaw,
  message: { create: mockMessageCreate },
  conversation: {
    findFirst: mockConversationFindFirst,
    create: mockConversationCreate,
    update: mockConversationUpdate
  },
  contactConsent: { updateMany: mockConsentUpdateMany },
  debtor: { findUnique: mockDebtorFindUnique }
};

const mockKafka = { publish: mockPublish };
const mockMarkResponse = vi.fn().mockResolvedValue(undefined);
const mockContacts = { markResponse: mockMarkResponse };

describe("TwilioWaWebhookHandler", () => {
  let handler: TwilioWaWebhookHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new TwilioWaWebhookHandler(
      mockPrisma as never,
      mockKafka as never,
      mockContacts as never
    );
  });

  it("mensaje normal → deudor encontrado → guarda mensaje y publica Kafka", async () => {
    mockQueryRaw
      .mockResolvedValueOnce([]) // resolveTenantByToNumber: número compartido, sin tenant dedicado
      .mockResolvedValueOnce([{ id: "debtor1", tenant_id: "org1" }]); // findDebtorByPhone
    mockDebtorFindUnique.mockResolvedValueOnce({
      id: "debtor1",
      tenantId: "org1"
    });
    mockConversationFindFirst.mockResolvedValueOnce({ id: "conv1" });

    await handler.handleInbound({
      MessageSid: "SMtest",
      From: "whatsapp:+573001234567",
      To: "whatsapp:+14155238886",
      Body: "Hola, ¿cuánto debo?",
      AccountSid: "ACtest"
    });

    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: "in",
          channel: "whatsapp"
        })
      })
    );
    expect(mockPublish).toHaveBeenCalledWith(
      "cobrai.whatsapp.message_received",
      "org1",
      expect.objectContaining({ debtor_id: "debtor1" })
    );
  });

  it("To coincide con whatsappFromNumber de un tenant → busca al deudor solo en ese tenant", async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ id: "org_dedicated" }]) // resolveTenantByToNumber: tenant con número propio
      .mockResolvedValueOnce([{ id: "debtor1", tenant_id: "org_dedicated" }]); // findDebtorByPhone
    mockDebtorFindUnique.mockResolvedValueOnce({
      id: "debtor1",
      tenantId: "org_dedicated"
    });
    mockConversationFindFirst.mockResolvedValueOnce({ id: "conv1" });

    await handler.handleInbound({
      MessageSid: "SMtest",
      From: "whatsapp:+573001234567",
      To: "whatsapp:+19998887777",
      Body: "Hola",
      AccountSid: "ACtest"
    });

    const debtorQuery = mockQueryRaw.mock.calls[1]?.[0] as TemplateStringsArray;
    expect(debtorQuery.join("")).toContain("tenant_id = ");
    expect(mockPublish).toHaveBeenCalledWith(
      "cobrai.whatsapp.message_received",
      "org_dedicated",
      expect.objectContaining({ debtor_id: "debtor1" })
    );
  });

  it("STOP → revoca consent, NO publica Kafka", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ id: "debtor1" }]);

    await handler.handleInbound({
      MessageSid: "SMtest",
      From: "whatsapp:+573001234567",
      To: "whatsapp:+14155238886",
      Body: "STOP",
      AccountSid: "ACtest"
    });

    expect(mockConsentUpdateMany).toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it("stop en minúsculas → también revoca consent", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ id: "debtor1" }]);

    await handler.handleInbound({
      MessageSid: "SMtest",
      From: "whatsapp:+573001234567",
      To: "whatsapp:+14155238886",
      Body: "stop",
      AccountSid: "ACtest"
    });

    expect(mockConsentUpdateMany).toHaveBeenCalled();
  });

  it("deudor no encontrado → solo log, sin error ni Kafka", async () => {
    mockQueryRaw
      .mockResolvedValueOnce([]) // resolveTenantByToNumber
      .mockResolvedValueOnce([]); // findDebtorByPhone: sin coincidencia

    await expect(
      handler.handleInbound({
        MessageSid: "SMtest",
        From: "whatsapp:+573009999999",
        To: "whatsapp:+14155238886",
        Body: "Hola",
        AccountSid: "ACtest"
      })
    ).resolves.toBeUndefined();

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("conversación no existe → crea una nueva", async () => {
    mockQueryRaw
      .mockResolvedValueOnce([]) // resolveTenantByToNumber
      .mockResolvedValueOnce([{ id: "debtor1", tenant_id: "org1" }]); // findDebtorByPhone
    mockDebtorFindUnique.mockResolvedValueOnce({
      id: "debtor1",
      tenantId: "org1"
    });
    mockConversationFindFirst.mockResolvedValueOnce(null);
    mockConversationCreate.mockResolvedValueOnce({ id: "conv_new" });

    await handler.handleInbound({
      MessageSid: "SMtest",
      From: "whatsapp:+573001234567",
      To: "whatsapp:+14155238886",
      Body: "Mensaje",
      AccountSid: "ACtest"
    });

    expect(mockConversationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: "whatsapp", status: "open" })
      })
    );
  });
});
