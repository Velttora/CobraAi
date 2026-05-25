import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { PrismaService } from "@cobrai/db";
import {
  ContactChannel,
  ConversationStatus
} from "@cobrai/db";
import { parseMessagePayload } from "../common/utils/api.utils";
import { TwilioWhatsAppAdapter } from "../adapters/twilio-whatsapp.adapter";

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: TwilioWhatsAppAdapter
  ) {}

  // ─── List conversations (paginada, filtrable) ────────────────────────────────
  async listConversations(
    tenantId: string,
    opts: { channel?: string; status?: string; page: number; limit: number }
  ) {
    const { page, limit } = opts;
    const skip = (page - 1) * limit;

    const channelFilter =
      opts.channel && Object.values(ContactChannel).includes(opts.channel as ContactChannel)
        ? (opts.channel as ContactChannel)
        : undefined;

    const statusFilter =
      opts.status && Object.values(ConversationStatus).includes(opts.status as ConversationStatus)
        ? (opts.status as ConversationStatus)
        : undefined;

    const where = {
      tenantId,
      deletedAt: null as null,
      ...(channelFilter ? { channel: channelFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {})
    };

    const [total, items] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: "desc" },
        include: {
          debtor: { select: { id: true, name: true, phones: true } },
          messages: {
            where: { deletedAt: null },
            orderBy: { sentAt: "desc" },
            take: 1
          }
        }
      })
    ]);

    return {
      total,
      page,
      limit,
      items: items.map((c) => ({
        id: c.id,
        channel: c.channel,
        status: c.status,
        last_message_at: c.lastMessageAt,
        debtor: {
          id: c.debtor.id,
          name: c.debtor.name
        },
        last_message: c.messages[0]
          ? parseMessagePayload(c.messages[0].content).text
          : null
      }))
    };
  }

  // ─── Escalations list ────────────────────────────────────────────────────────
  async listEscalations(tenantId: string) {
    const items = await this.prisma.conversation.findMany({
      where: {
        tenantId,
        status: ConversationStatus.escalated,
        deletedAt: null
      },
      orderBy: { lastMessageAt: "desc" },
      include: {
        debtor: { select: { id: true, name: true } },
        messages: {
          where: { deletedAt: null },
          orderBy: { sentAt: "desc" },
          take: 1
        }
      }
    });

    return items.map((c) => ({
      id: c.id,
      channel: c.channel,
      status: c.status,
      last_message_at: c.lastMessageAt,
      debtor: { id: c.debtor.id, name: c.debtor.name },
      last_message: c.messages[0]
        ? parseMessagePayload(c.messages[0].content).text
        : null
    }));
  }

  // ─── Resolve escalation ──────────────────────────────────────────────────────
  async resolveEscalation(tenantId: string, conversationId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId, deletedAt: null }
    });
    if (!conv) throw new NotFoundException("Conversación no encontrada");

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { status: ConversationStatus.open }
    });

    return { resolved: true };
  }

  // ─── Messages list ───────────────────────────────────────────────────────────
  async getMessages(
    tenantId: string,
    conversationId: string,
    opts: { page: number; limit: number }
  ) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId, deletedAt: null }
    });
    if (!conv) throw new NotFoundException("Conversación no encontrada");

    const { page, limit } = opts;
    const skip = (page - 1) * limit;

    const [total, messages] = await Promise.all([
      this.prisma.message.count({
        where: { conversationId, tenantId, deletedAt: null }
      }),
      this.prisma.message.findMany({
        where: { conversationId, tenantId, deletedAt: null },
        orderBy: { sentAt: "asc" },
        skip,
        take: limit
      })
    ]);

    return {
      total,
      page,
      limit,
      conversation_id: conversationId,
      channel: conv.channel,
      status: conv.status,
      messages: messages.map((m) => {
        const parsed = parseMessagePayload(m.content);
        let humanSent = false;
        try {
          const raw = JSON.parse(m.content) as Record<string, unknown>;
          humanSent = Boolean(raw["human_sent"]);
        } catch {
          /* noop */
        }
        return {
          id: m.id,
          direction: m.direction,
          channel: m.channel,
          text: parsed.text,
          human_sent: humanSent,
          status: m.status,
          sent_at: m.sentAt ?? m.createdAt
        };
      })
    };
  }

  // ─── Human reply ─────────────────────────────────────────────────────────────
  async reply(tenantId: string, conversationId: string, body: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId, deletedAt: null },
      include: { debtor: { select: { phones: true } } }
    });
    if (!conv) throw new NotFoundException("Conversación no encontrada");
    if (conv.channel !== ContactChannel.whatsapp) {
      throw new BadRequestException(
        "Respuesta manual solo soportada en WhatsApp"
      );
    }

    const phones = conv.debtor.phones as string[];
    const phone = phones[0];
    if (!phone) throw new BadRequestException("Deudor sin teléfono registrado");

    const result = await this.whatsapp.sendTemplate({
      to: phone,
      template_id: "manual_reply",
      variables: { body },
      tenant_id: tenantId
    });

    await this.prisma.message.create({
      data: {
        tenantId,
        conversationId,
        direction: "out",
        channel: ContactChannel.whatsapp,
        content: JSON.stringify({ text: body, human_sent: true }),
        status: result.status === "sent" ? "sent" : "failed",
        sentAt: new Date()
      }
    });

    // Auto-resolve escalation cuando el agente responde
    if (conv.status === ConversationStatus.escalated) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { status: ConversationStatus.open }
      });
      this.logger.log(
        `Escalación resuelta automáticamente en conv ${conversationId}`
      );
    }

    return { sent: result.status === "sent" };
  }

  // ─── Existing: getByDebtor ───────────────────────────────────────────────────
  async getByDebtor(tenantId: string, debtorId: string) {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId, deletedAt: null }
    });
    if (!debtor) {
      throw new NotFoundException("Deudor no encontrado");
    }

    const conversations = await this.prisma.conversation.findMany({
      where: { tenantId, debtorId, deletedAt: null },
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { lastMessageAt: "desc" }
    });

    const thread = conversations
      .flatMap((c) =>
        c.messages.map((m) => ({
          id: m.id,
          channel: m.channel,
          direction: m.direction,
          content: parseMessagePayload(m.content).text,
          status: m.status,
          sent_at: m.sentAt ?? m.createdAt,
          conversation_id: c.id
        }))
      )
      .sort(
        (a, b) =>
          new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
      );

    return {
      debtor_id: debtorId,
      debtor_name: debtor.name,
      messages: thread
    };
  }
}
