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
import { EmailAdapter } from "../adapters/email.adapter";
import { EMAIL_REPLY_TO } from "../common/email.constants";
import { ComplianceService } from "@cobrai/compliance";

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: TwilioWhatsAppAdapter,
    private readonly email: EmailAdapter,
    private readonly compliance: ComplianceService
  ) {}

  // ─── List conversations (paginada, filtrable) ────────────────────────────────
  async listConversations(
    tenantId: string,
    opts: { channel?: string; status?: string; outcome?: string; page: number; limit: number; portfolioId?: string }
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
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(opts.portfolioId
        ? {
            OR: [
              { debt: { portfolioId: opts.portfolioId } },
              { debtor: { debts: { some: { portfolioId: opts.portfolioId, tenantId, deletedAt: null } } } }
            ]
          }
        : {})
    };

    const [total, items] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: "desc" },
        include: {
          debtor: {
            select: {
              id: true,
              name: true,
              phones: true,
              debts: {
                where: { tenantId, deletedAt: null },
                select: { portfolio: { select: { id: true, name: true } } },
                orderBy: { createdAt: "desc" },
                take: 1
              }
            }
          },
          debt: { select: { portfolio: { select: { id: true, name: true } } } },
          messages: {
            where: { deletedAt: null },
            orderBy: { sentAt: "desc" },
            take: 1
          }
        }
      })
    ]);

    // Enriquecer conversaciones de voz con outcome y duración del último Contact completado
    const voiceDebtorIds = [...new Set(items.filter(c => c.channel === "voice").map(c => c.debtor.id))];
    const lastCallByDebtor = new Map<string, { outcome: string | null; durationSeconds: number | null }>();

    if (voiceDebtorIds.length > 0) {
      const recentContacts = await this.prisma.contact.findMany({
        where: { tenantId, debtorId: { in: voiceDebtorIds }, channel: "voice", status: "completed" },
        orderBy: { endedAt: "desc" },
        select: { debtorId: true, outcome: true, durationSeconds: true }
      });
      for (const c of recentContacts) {
        if (!lastCallByDebtor.has(c.debtorId)) {
          lastCallByDebtor.set(c.debtorId, { outcome: c.outcome ?? null, durationSeconds: c.durationSeconds ?? null });
        }
      }
    }

    // Estado de respuesta (Mensaje enviado / Contacto efectivo / Sin contacto) del intento
    // de contacto más reciente del deudor — cualquier canal.
    const allDebtorIds = [...new Set(items.map((c) => c.debtor.id))];
    const lastResponseByDebtor = new Map<
      string,
      { responseStatus: string; attemptNumber: number }
    >();

    if (allDebtorIds.length > 0) {
      const recentAttempts = await this.prisma.contact.findMany({
        where: {
          tenantId,
          debtorId: { in: allDebtorIds },
          deletedAt: null,
          status: { in: ["in_progress", "completed"] }
        },
        orderBy: { createdAt: "desc" },
        select: { debtorId: true, responseStatus: true, attemptNumber: true }
      });
      for (const c of recentAttempts) {
        if (!lastResponseByDebtor.has(c.debtorId)) {
          lastResponseByDebtor.set(c.debtorId, {
            responseStatus: c.responseStatus,
            attemptNumber: c.attemptNumber
          });
        }
      }
    }

    let mappedItems = items.map((c) => ({
      id: c.id,
      channel: c.channel,
      status: c.status,
      last_message_at: c.lastMessageAt,
      debtor: { id: c.debtor.id, name: c.debtor.name },
      portfolio: c.debt?.portfolio ?? c.debtor.debts[0]?.portfolio ?? null,
      last_message: c.messages[0] ? parseMessagePayload(c.messages[0].content).text : null,
      last_call_outcome: c.channel === "voice" ? (lastCallByDebtor.get(c.debtor.id)?.outcome ?? null) : null,
      last_call_duration: c.channel === "voice" ? (lastCallByDebtor.get(c.debtor.id)?.durationSeconds ?? null) : null,
      last_response_status: lastResponseByDebtor.get(c.debtor.id)?.responseStatus ?? null,
      last_response_attempt: lastResponseByDebtor.get(c.debtor.id)?.attemptNumber ?? null
    }));

    // Filtro de outcome en memoria (deuda técnica: migrar a subquery para alto volumen)
    if (opts.outcome && channelFilter === "voice") {
      mappedItems = mappedItems.filter(c => c.last_call_outcome === opts.outcome);
    }

    return { total, page, limit, items: mappedItems };
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

  // ─── Escalate by workflow rule ───────────────────────────────────────────────
  // Llamado cuando cobrai.debt.escalated llega con target="human".
  // Marca la conversación activa como escalated o crea una nueva de canal "internal".
  async escalateByWorkflow(
    tenantId: string,
    debtId: string,
    ruleName: string
  ): Promise<void> {
    // Buscar conversación activa para esta deuda (no cerrada, no archivada)
    const existing = await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        debtId,
        deletedAt: null,
        status: { notIn: [ConversationStatus.closed, ConversationStatus.archived] }
      },
      orderBy: { lastMessageAt: "desc" }
    });

    const systemContent = JSON.stringify({
      text: `Escalado automáticamente por regla: "${ruleName}". Requiere atención humana.`,
      system_event: "workflow_escalation"
    });

    if (existing) {
      await this.prisma.conversation.update({
        where: { id: existing.id },
        data: { status: ConversationStatus.escalated, lastMessageAt: new Date() }
      });
      await this.prisma.message.create({
        data: {
          tenantId,
          conversationId: existing.id,
          direction: "out",
          channel: existing.channel,
          content: systemContent,
          status: "sent",
          sentAt: new Date()
        }
      });
      this.logger.log(`Conv ${existing.id} escalada por regla "${ruleName}"`);
      return;
    }

    // Sin conversación activa: buscar deudor por deuda para crear una nueva
    const debt = await this.prisma.debt.findFirst({
      where: { id: debtId, tenantId, deletedAt: null },
      select: { debtorId: true }
    });
    if (!debt) {
      this.logger.warn(`escalateByWorkflow: deuda ${debtId} no encontrada`);
      return;
    }

    const conv = await this.prisma.conversation.create({
      data: {
        tenantId,
        debtorId: debt.debtorId,
        debtId,
        channel: "internal" as ContactChannel,
        status: ConversationStatus.escalated,
        lastMessageAt: new Date()
      }
    });
    await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conv.id,
        direction: "out",
        channel: "internal" as ContactChannel,
        content: systemContent,
        status: "sent",
        sentAt: new Date()
      }
    });
    this.logger.log(`Nueva conv interna creada y escalada por regla "${ruleName}" (deuda ${debtId})`);
  }

  // ─── Add system message on agent escalation ──────────────────────────────────
  // Cuando el agente ya marcó la conv como escalated, agrega un mensaje de contexto visible.
  async addEscalationSystemMessage(
    tenantId: string,
    conversationId: string,
    reason: string
  ): Promise<void> {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId, deletedAt: null }
    });
    if (!conv) return;

    await this.prisma.message.create({
      data: {
        tenantId,
        conversationId,
        direction: "out",
        channel: conv.channel,
        content: JSON.stringify({
          text: `El deudor solicitó atención humana. Motivo: ${reason}.`,
          system_event: "agent_escalation"
        }),
        status: "sent",
        sentAt: new Date()
      }
    });
  }

  // ─── Resolve escalation ──────────────────────────────────────────────────────
  async resolveEscalation(
    tenantId: string,
    conversationId: string,
    outcome: "pending" | "promised",
    note?: string
  ) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId, deletedAt: null }
    });
    if (!conv) throw new NotFoundException("Conversación no encontrada");

    const newStatus =
      outcome === "pending" ? ConversationStatus.pending : ConversationStatus.open;

    const outcomeLabel =
      outcome === "pending" ? "Pendiente de confirmación" : "Acuerdo registrado — vuelve a cola";

    const systemText = note
      ? `${outcomeLabel}. Nota: ${note}`
      : outcomeLabel;

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { status: newStatus, lastMessageAt: new Date() }
      }),
      this.prisma.message.create({
        data: {
          tenantId,
          conversationId,
          direction: "out",
          channel: conv.channel,
          content: JSON.stringify({ text: systemText, system_event: "escalation_resolved" }),
          status: "sent",
          sentAt: new Date()
        }
      })
    ]);

    return { resolved: true, status: newStatus };
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
          voice: parsed.voice ?? null,
          human_sent: humanSent,
          status: m.status,
          sent_at: m.sentAt ?? m.createdAt
        };
      })
    };
  }

  // ─── Human reply (multi-canal con redirección al canal configurado) ──────────
  async reply(tenantId: string, conversationId: string, body: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId, deletedAt: null },
      include: { debtor: { select: { id: true, phones: true, email: true } } }
    });
    if (!conv) throw new NotFoundException("Conversación no encontrada");

    const phones = (conv.debtor.phones as string[]) ?? [];
    const phone = phones[0];
    const email = conv.debtor.email;

    // Canales de texto candidatos, en orden: el de la conversación primero; si no
    // está configurado/habilitado, se redirige al alterno posible. Voz y SMS no
    // admiten respuesta de texto manual (voz=llamada; SMS apagado por flag).
    const preferred =
      conv.channel === ContactChannel.email
        ? ContactChannel.email
        : ContactChannel.whatsapp;
    const candidates = this.replyChannelOrder(preferred, phone, email);

    let used: { channel: ContactChannel; status: "sent" | "failed" } | null = null;
    for (const channel of candidates) {
      const eligible = await this.compliance.isChannelEligible({
        tenantId,
        debtorId: conv.debtor.id,
        channel
      });
      if (!eligible.allowed) {
        this.logger.debug(
          `Canal ${channel} no habilitado para reply (conv ${conversationId}): ${eligible.reason}`
        );
        continue;
      }
      if (channel === ContactChannel.whatsapp && phone) {
        const r = await this.whatsapp.sendTemplate({
          to: phone,
          template_id: "manual_reply",
          variables: { body },
          tenant_id: tenantId
        });
        used = { channel, status: r.status };
        break;
      }
      if (channel === ContactChannel.email && email) {
        const r = await this.email.sendTemplate({
          to: email,
          template_id: "manual_reply",
          variables: { body, subject: "Respuesta de su gestor — CobraAI" },
          tenant_id: tenantId,
          reply_to: EMAIL_REPLY_TO
        });
        used = { channel, status: r.status };
        break;
      }
    }

    if (!used) {
      throw new BadRequestException(
        "No hay un canal habilitado y configurado para responder a este deudor (WhatsApp o email)."
      );
    }

    await this.prisma.message.create({
      data: {
        tenantId,
        conversationId,
        direction: "out",
        channel: used.channel,
        content: JSON.stringify({ text: body, human_sent: true }),
        status: used.status === "sent" ? "sent" : "failed",
        sentAt: new Date()
      }
    });

    // Auto-resolve escalation cuando el agente humano responde
    if (conv.status === ConversationStatus.escalated) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { status: ConversationStatus.open }
      });
      this.logger.log(
        `Escalación resuelta en conv ${conversationId} (respondida por ${used.channel})`
      );
    }

    return { sent: used.status === "sent", channel: used.channel };
  }

  /**
   * Orden de canales de texto para responder, según preferencia (el canal de la
   * conversación) y disponibilidad de dato de contacto. La elegibilidad real
   * (consent/opt-out/opt-in) la valida el caller con isChannelEligible.
   */
  private replyChannelOrder(
    preferred: ContactChannel,
    phone?: string,
    email?: string | null
  ): ContactChannel[] {
    const order: ContactChannel[] = [];
    const add = (c: ContactChannel) => {
      if (order.includes(c)) return;
      if (c === ContactChannel.whatsapp && phone) order.push(c);
      else if (c === ContactChannel.email && email) order.push(c);
    };
    add(preferred);
    add(ContactChannel.whatsapp);
    add(ContactChannel.email);
    return order;
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
