import { vi, describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { ConversationsService } from "./conversations.service";
import { ContactChannel, ConversationStatus } from "@cobrai/db";

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockConversationFindMany = vi.fn();
const mockConversationCount = vi.fn();
const mockConversationFindFirst = vi.fn();
const mockConversationUpdate = vi.fn().mockResolvedValue({});
const mockMessageFindMany = vi.fn();
const mockMessageCount = vi.fn();
const mockMessageCreate = vi.fn().mockResolvedValue({ id: "msg1" });
const mockDebtorFindFirst = vi.fn();
const mockContactFindMany = vi.fn().mockResolvedValue([]);

const mockPrisma = {
  conversation: {
    findMany: mockConversationFindMany,
    count: mockConversationCount,
    findFirst: mockConversationFindFirst,
    update: mockConversationUpdate
  },
  message: {
    findMany: mockMessageFindMany,
    count: mockMessageCount,
    create: mockMessageCreate
  },
  contact: { findMany: mockContactFindMany },
  debtor: { findFirst: mockDebtorFindFirst },
  $transaction: vi.fn().mockResolvedValue([])
};

// ── Adapters + compliance mocks ───────────────────────────────────────────────
const mockWhatsapp = {
  sendTemplate: vi.fn().mockResolvedValue({ message_id: "wm1", status: "sent" })
};
const mockEmail = {
  sendTemplate: vi.fn().mockResolvedValue({ message_id: "em1", status: "sent" })
};
const mockCompliance = {
  isChannelEligible: vi.fn().mockResolvedValue({ allowed: true })
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const baseConv = {
  id: "conv1",
  tenantId: "org1",
  debtorId: "debtor1",
  channel: ContactChannel.whatsapp,
  status: ConversationStatus.open,
  lastMessageAt: new Date(),
  debtor: { id: "debtor1", name: "Juan", phones: ["+573001234567"], email: "juan@test.com", debts: [] },
  messages: [
    {
      id: "m1",
      content: JSON.stringify({ text: "Hola" }),
      direction: "out",
      channel: ContactChannel.whatsapp,
      status: "sent",
      sentAt: new Date(),
      createdAt: new Date(),
      deletedAt: null
    }
  ]
};

describe("ConversationsService", () => {
  let service: ConversationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restaurar default tras posibles mockImplementation en tests previos.
    mockCompliance.isChannelEligible.mockResolvedValue({ allowed: true });
    service = new ConversationsService(
      mockPrisma as never,
      mockWhatsapp as never,
      mockEmail as never,
      mockCompliance as never
    );
  });

  // ─── listConversations ────────────────────────────────────────────────────

  it("listConversations → retorna total + items mapeados", async () => {
    mockConversationCount.mockResolvedValueOnce(1);
    mockConversationFindMany.mockResolvedValueOnce([baseConv]);

    const result = await service.listConversations("org1", {
      page: 1,
      limit: 25
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "conv1",
      channel: ContactChannel.whatsapp,
      debtor: { id: "debtor1", name: "Juan" }
    });
  });

  it("listConversations con channel inválido → no filtra por channel", async () => {
    mockConversationCount.mockResolvedValueOnce(0);
    mockConversationFindMany.mockResolvedValueOnce([]);

    await service.listConversations("org1", {
      channel: "invalid_channel",
      page: 1,
      limit: 25
    });

    const whereArg = mockConversationFindMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(whereArg?.where).not.toHaveProperty("channel");
  });

  // ─── listEscalations ──────────────────────────────────────────────────────

  it("listEscalations → filtra por status=escalated", async () => {
    const escalatedConv = { ...baseConv, status: ConversationStatus.escalated };
    mockConversationFindMany.mockResolvedValueOnce([escalatedConv]);

    const result = await service.listEscalations("org1");

    expect(result).toHaveLength(1);
    const whereArg = mockConversationFindMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(whereArg?.where).toMatchObject({ status: ConversationStatus.escalated });
  });

  // ─── resolveEscalation ───────────────────────────────────────────────────

  it("resolveEscalation promised → actualiza status a open", async () => {
    mockConversationFindFirst.mockResolvedValueOnce(baseConv);

    const result = await service.resolveEscalation("org1", "conv1", "promised");

    expect(result).toEqual({ resolved: true, status: ConversationStatus.open });
  });

  it("resolveEscalation pending → actualiza status a pending", async () => {
    mockConversationFindFirst.mockResolvedValueOnce(baseConv);

    const result = await service.resolveEscalation("org1", "conv1", "pending");

    expect(result).toEqual({ resolved: true, status: ConversationStatus.pending });
  });

  it("resolveEscalation → NotFoundException si no existe", async () => {
    mockConversationFindFirst.mockResolvedValueOnce(null);

    await expect(service.resolveEscalation("org1", "conv999", "pending")).rejects.toThrow(
      NotFoundException
    );
  });

  // ─── getMessages ─────────────────────────────────────────────────────────

  it("getMessages → NotFoundException si conv no existe", async () => {
    mockConversationFindFirst.mockResolvedValueOnce(null);

    await expect(service.getMessages("org1", "conv999", { page: 1, limit: 50 })).rejects.toThrow(
      NotFoundException
    );
  });

  it("getMessages → retorna mensajes paginados", async () => {
    mockConversationFindFirst.mockResolvedValueOnce(baseConv);
    mockMessageCount.mockResolvedValueOnce(2);
    mockMessageFindMany.mockResolvedValueOnce([
      {
        id: "m1",
        direction: "out",
        channel: "whatsapp",
        content: JSON.stringify({ text: "Hola Juan" }),
        status: "sent",
        sentAt: new Date(),
        createdAt: new Date()
      }
    ]);

    const result = await service.getMessages("org1", "conv1", { page: 1, limit: 50 });

    expect(result.total).toBe(2);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      direction: "out",
      text: "Hola Juan",
      human_sent: false
    });
  });

  // ─── reply ───────────────────────────────────────────────────────────────

  it("reply → envía WA, guarda mensaje, retorna sent:true", async () => {
    mockConversationFindFirst.mockResolvedValueOnce(baseConv);

    const result = await service.reply("org1", "conv1", "Hola, el pago se procesó.");

    expect(mockWhatsapp.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+573001234567",
        variables: { body: "Hola, el pago se procesó." }
      })
    );
    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: "out", channel: ContactChannel.whatsapp })
      })
    );
    expect(result).toEqual({ sent: true, channel: ContactChannel.whatsapp });
  });

  it("reply en conv de email responde por email con reply_to", async () => {
    mockConversationFindFirst.mockResolvedValueOnce({
      ...baseConv,
      channel: ContactChannel.email
    });

    const result = await service.reply("org1", "conv1", "Gracias por su mensaje.");

    expect(mockEmail.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "juan@test.com",
        reply_to: "reply@reply.fogging.org"
      })
    );
    expect(mockWhatsapp.sendTemplate).not.toHaveBeenCalled();
    expect(result.channel).toBe(ContactChannel.email);
  });

  it("reply en conv de voz redirige al canal posible/configurado (whatsapp)", async () => {
    mockConversationFindFirst.mockResolvedValueOnce({
      ...baseConv,
      channel: ContactChannel.voice
    });

    const result = await service.reply("org1", "conv1", "Le respondo por aquí.");

    // No se puede responder texto a una llamada → redirige a whatsapp (configurado)
    expect(mockWhatsapp.sendTemplate).toHaveBeenCalled();
    expect(result.channel).toBe(ContactChannel.whatsapp);
  });

  it("reply redirige a email cuando whatsapp no está habilitado", async () => {
    mockConversationFindFirst.mockResolvedValueOnce(baseConv);
    // WhatsApp no elegible (sin opt-in), email sí.
    mockCompliance.isChannelEligible.mockImplementation(
      async ({ channel }: { channel: ContactChannel }) =>
        channel === ContactChannel.whatsapp
          ? { allowed: false, reason: "whatsapp_not_opted_in" }
          : { allowed: true }
    );

    const result = await service.reply("org1", "conv1", "Le escribo por correo.");

    expect(mockEmail.sendTemplate).toHaveBeenCalled();
    expect(result.channel).toBe(ContactChannel.email);
  });

  it("reply → BadRequestException si no hay canal configurado/elegible", async () => {
    mockConversationFindFirst.mockResolvedValueOnce({
      ...baseConv,
      channel: ContactChannel.voice,
      debtor: { id: "debtor1", name: "Juan", phones: [], email: null }
    });

    await expect(service.reply("org1", "conv1", "Hola")).rejects.toThrow(
      BadRequestException
    );
  });

  it("reply → NotFoundException si conv no existe", async () => {
    mockConversationFindFirst.mockResolvedValueOnce(null);

    await expect(service.reply("org1", "conv999", "Hola")).rejects.toThrow(
      NotFoundException
    );
  });

  it("reply escalated → auto-resuelve escalación", async () => {
    mockConversationFindFirst.mockResolvedValueOnce({
      ...baseConv,
      status: ConversationStatus.escalated
    });

    await service.reply("org1", "conv1", "Le ayudo ahora.");

    expect(mockConversationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: ConversationStatus.open }
      })
    );
  });
});
