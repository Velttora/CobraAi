import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  PrismaService,
  type ContactChannel,
  type Debt,
  type Debtor,
  type NotificationTemplate
} from "@cobrai/db";
import { EmailAdapter } from "../adapters/email.adapter";
import { SmsAdapter } from "../adapters/sms.adapter";
import { VapiVoiceAdapter } from "../adapters/vapi-voice.adapter";
import { TwilioWhatsAppAdapter } from "../adapters/twilio-whatsapp.adapter";
import { ComplianceService } from "@cobrai/compliance";
import {
  DEFAULT_EMAIL_LAYOUT,
  renderEmailLayout,
  type EmailLayoutConfig
} from "@cobrai/utils";
import {
  buildMessageContent,
  decimalToNumber,
  fechaEspanol,
  formatDate,
  formatMoney,
  montoEspanol,
  phonesFromDebtor,
  renderTemplate
} from "../common/utils/api.utils";
import { KafkaService } from "../kafka/kafka.service";
import { WaterfallService } from "../orchestrator/waterfall.service";
import { DebtorMemoryService } from "../memory/debtor-memory.service";
import type { CreateContactDto } from "./dto/contact.dto";

export type ContactRequestPayload = {
  debt_id: string;
  debtor_id?: string;
  channel?: ContactChannel;
  rule_id?: string;
  template_id?: string;
  template_hint?: string;
};

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly email: EmailAdapter,
    private readonly sms: SmsAdapter,
    private readonly whatsapp: TwilioWhatsAppAdapter,
    private readonly voice: VapiVoiceAdapter,
    private readonly kafka: KafkaService,
    private readonly waterfall: WaterfallService,
    private readonly config: ConfigService,
    private readonly debtorMemory: DebtorMemoryService
  ) {}

  async list(tenantId: string, debtId?: string, channel?: ContactChannel, portfolioId?: string) {
    const items = await this.prisma.contact.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(debtId ? { debtId } : {}),
        ...(channel ? { channel } : {}),
        ...(portfolioId ? { debt: { portfolioId } } : {})
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        debtor: { select: { id: true, name: true } },
        debt: { select: { portfolio: { select: { id: true, name: true } } } }
      }
    });
    return items;
  }

  async createManual(tenantId: string, dto: CreateContactDto) {
    return this.executeContact(tenantId, {
      debt_id: dto.debt_id,
      channel: dto.channel,
      template_id: dto.template_id,
      scheduled_at: dto.scheduled_at
    });
  }

  async handleContactRequested(
    tenantId: string,
    payload: ContactRequestPayload
  ): Promise<void> {
    if (payload.channel) {
      await this.executeContact(tenantId, {
        debt_id: payload.debt_id,
        channel: payload.channel,
        template_id: payload.template_id,
        template_hint: payload.template_hint
      });
      return;
    }

    const debt = await this.getDebtContext(tenantId, payload.debt_id);
    const channels = this.availableChannels(debt.debtor);
    const first = this.waterfall.nextChannel(null, channels);
    if (!first) {
      await this.kafka.publish("cobrai.contact.failed.no_response", tenantId, {
        debt_id: payload.debt_id,
        reason: "no_available_channel"
      });
      return;
    }

    await this.executeContact(tenantId, {
      debt_id: payload.debt_id,
      channel: first,
      template_hint: payload.template_hint
    });
  }

  async executeContact(
    tenantId: string,
    input: {
      debt_id: string;
      channel: ContactChannel;
      template_id?: string;
      template_hint?: string;
      scheduled_at?: string;
    }
  ) {
    const debt = await this.getDebtContext(tenantId, input.debt_id);
    const debtor = debt.debtor;
    const empresa = debt.tenant?.name ?? "CobraAI";
    const at = input.scheduled_at ? new Date(input.scheduled_at) : new Date();

    // Sin servicio de SMS activo, todo mensaje SMS se envía por WhatsApp.
    input = { ...input, channel: this.resolveMessageChannel(input.channel) };

    const compliance = await this.compliance.checkBeforeSend({
      tenantId,
      debtor,
      channel: input.channel,
      at
    });

    if (!compliance.allowed) {
      if (compliance.reason === "outside_hours" && compliance.next_allowed_at) {
        const scheduled = await this.prisma.contact.create({
          data: {
            tenantId,
            debtId: debt.id,
            debtorId: debtor.id,
            channel: input.channel,
            status: "scheduled",
            startedAt: compliance.next_allowed_at
          }
        });
        this.logger.warn(
          `Contacto ${scheduled.id} reprogramado para ${compliance.next_allowed_at.toISOString()} (${compliance.reason})`
        );
        return {
          contact: scheduled,
          blocked: true,
          reason: compliance.reason,
          next_valid_at: compliance.next_allowed_at.toISOString()
        };
      }

      if (compliance.reason === "weekly_limit") {
        await this.debtorMemory.registerPendingDebt(tenantId, debtor.id, {
          debtId: debt.id,
          externalRef: debt.externalRef ?? null,
          amountOutstanding: decimalToNumber(debt.amountOutstanding),
          currency: debt.currency,
          dueDate: new Date(debt.dueDate).toISOString().split("T")[0] as string
        });
      }

      this.logger.warn(
        `Contacto bloqueado debt=${debt.id} channel=${input.channel} reason=${compliance.reason}`
      );
      return {
        blocked: true,
        reason: compliance.reason
      };
    }

    const template = await this.resolveTemplate(
      tenantId,
      input.channel,
      input.template_id,
      input.template_hint
    );

    const variables = this.buildVariables(debt, debtor, empresa);
    const contact = await this.prisma.contact.create({
      data: {
        tenantId,
        debtId: debt.id,
        debtorId: debtor.id,
        channel: input.channel,
        status: "in_progress",
        startedAt: at
      }
    });

    try {
      const sendResult = await this.dispatchChannel(
        tenantId,
        input.channel,
        debt,
        debtor,
        template,
        variables
      );

      await this.recordConversationMessage(
        tenantId,
        debtor.id,
        debt.id,
        input.channel,
        template,
        variables,
        sendResult.messageId,
        sendResult.body
      );

      const completed = await this.prisma.contact.update({
        where: { id: contact.id },
        data: {
          status: sendResult.status === "failed" ? "failed" : "completed",
          endedAt: new Date()
        }
      });

      await this.kafka.publish("cobrai.contact.completed", tenantId, {
        debt_id: debt.id,
        debtor_id: debtor.id,
        contact_id: contact.id,
        channel: input.channel,
        outcome: sendResult.status === "failed" ? "refused" : "no_answer",
        provider_message_id: sendResult.messageId
      });

      // Solo limpiar si el mensaje llegó efectivamente al deudor
      if (sendResult.status !== "failed") {
        await this.debtorMemory.clearPendingDebts(tenantId, debtor.id);
      }

      return { contact: completed, blocked: false };
    } catch (err) {
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: { status: "failed", endedAt: new Date() }
      });
      throw err;
    }
  }

  /** Mientras FEATURE_SMS_ENABLED no esté activo, SMS se trata como WhatsApp. */
  private resolveMessageChannel(channel: ContactChannel): ContactChannel {
    const smsEnabled =
      this.config.get<string>("FEATURE_SMS_ENABLED") === "true";
    if (!smsEnabled && channel === "sms") {
      return "whatsapp";
    }
    return channel;
  }

  private async dispatchChannel(
    tenantId: string,
    channel: ContactChannel,
    debt: Debt & { debtor: Debtor },
    debtor: Debtor,
    template: NotificationTemplate | null,
    variables: Record<string, string>
  ): Promise<{ messageId: string; status: "sent" | "failed"; body: string }> {
    const body = template
      ? renderTemplate(template.content, variables)
      : `Recordatorio de pago: ${variables.amount}`;

    switch (channel) {
      case "email": {
        const to = debtor.email;
        if (!to) throw new BadRequestException("Deudor sin email");
        // El cuerpo es el mensaje de la regla (o un mensaje cordial por defecto);
        // se envuelve en el shell publicado del tenant (o el layout por defecto).
        const messageBody = template
          ? renderTemplate(template.content, variables)
          : this.defaultEmailMessage(variables);
        const layoutConfig = await this.resolvePublishedLayout(tenantId);
        const html = renderEmailLayout(layoutConfig, {
          body: messageBody,
          variables
        });
        const subject = this.deriveEmailSubject(template, variables);
        const result = await this.email.sendTemplate({
          to,
          template_id: template?.id ?? "default",
          variables: { ...variables, body: html, subject },
          tenant_id: tenantId
        });
        // Guardamos el mensaje legible (no el HTML) en la conversación.
        return { messageId: result.message_id, status: result.status, body: messageBody };
      }
      case "sms": {
        const phone = phonesFromDebtor(debtor.phones)[0];
        if (!phone) throw new BadRequestException("Deudor sin teléfono");
        const result = await this.sms.sendSMS({
          to: phone,
          body,
          tenant_id: tenantId
        });
        return { messageId: result.message_id, status: result.status, body };
      }
      case "whatsapp": {
        const phone = phonesFromDebtor(debtor.phones)[0];
        if (!phone) throw new BadRequestException("Deudor sin teléfono");
        const result = await this.whatsapp.sendTemplate({
          to: phone,
          template_id: template?.id ?? "default",
          variables,
          tenant_id: tenantId
        });
        return { messageId: result.message_id, status: result.status, body };
      }
      case "voice": {
        const phone = phonesFromDebtor(debtor.phones)[0];
        if (!phone) throw new BadRequestException("Deudor sin teléfono");
        const callHistory = await this.loadVoiceCallHistory(debtor.id, tenantId, debt.id, debtor.name, String(decimalToNumber(debt.amountOutstanding)), new Date(debt.dueDate).toISOString(), variables.empresa ?? "CobraAI");
        const result = await this.voice.initiateCall({
          debt_id: debt.id,
          debtor_phone: phone,
          strategy_context: {
            tenant_id: tenantId,
            strategy_id: debt.strategyId ?? debt.id,
            template_id: template?.id,
            language: template?.language ?? "es",
            segment: debt.aiSegment ?? "medium",
            preferred_channel: "voice",
            variables: { ...variables, ...callHistory }
          }
        });
        return {
          messageId: result.call_id,
          status: result.status === "failed" ? "failed" : "sent",
          body: "Llamada encolada"
        };
      }
      default:
        throw new BadRequestException(`Canal no soportado: ${channel}`);
    }
  }

  /** Shell de correo publicado del tenant, o el layout por defecto si no hay. */
  private async resolvePublishedLayout(
    tenantId: string
  ): Promise<EmailLayoutConfig> {
    const layout = await this.prisma.emailLayout.findUnique({
      where: { tenantId },
      select: { published: true }
    });
    return (layout?.published as EmailLayoutConfig | null) ?? DEFAULT_EMAIL_LAYOUT;
  }

  /** Cuerpo cordial por defecto cuando la regla no define plantilla. */
  private defaultEmailMessage(variables: Record<string, string>): string {
    const nombre = (variables.nombre ?? "").split(" ")[0] || "estimado/a";
    const montoNum = Number(variables.amount ?? variables.monto ?? 0);
    const monto =
      Number.isFinite(montoNum) && montoNum > 0
        ? `$${montoNum.toLocaleString("es-CO")} COP`
        : (variables.amount ?? "su saldo pendiente");
    const fecha = fechaEspanol(variables.due_date);
    const vencimiento = fecha ? ` con vencimiento el ${fecha}` : "";
    return (
      `Hola ${nombre},\n\n` +
      `Le recordamos de manera cordial que registra un saldo pendiente de ${monto}${vencimiento}. ` +
      `Queremos ayudarle a resolverlo de la forma más conveniente para usted.\n\n` +
      `Si ya realizó el pago, ignore este mensaje; puede tardar 24-48h en reflejarse.`
    );
  }

  /** Asunto del correo: el de la regla (con variables) o uno derivado. */
  private deriveEmailSubject(
    template: NotificationTemplate | null,
    variables: Record<string, string>
  ): string {
    if (template?.subject && template.subject.trim()) {
      return renderTemplate(template.subject, variables);
    }
    const empresa = variables.empresa ?? "CobraAI";
    return `Recordatorio de pago — ${empresa}`;
  }

  private async recordConversationMessage(
    tenantId: string,
    debtorId: string,
    debtId: string,
    channel: ContactChannel,
    template: NotificationTemplate | null,
    variables: Record<string, string>,
    providerMessageId: string,
    body: string
  ): Promise<void> {
    let conversation = await this.prisma.conversation.findFirst({
      where: { tenantId, debtorId, channel, deletedAt: null }
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          tenantId,
          debtorId,
          debtId,
          channel,
          status: "open",
          lastMessageAt: new Date()
        }
      });
    } else {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), debtId }
      });
    }

    await this.prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        direction: "out",
        channel,
        content: buildMessageContent(
          template ? renderTemplate(template.content, variables) : body,
          providerMessageId
        ),
        status: "sent",
        templateId: template?.id,
        sentAt: new Date()
      }
    });
  }

  private async loadVoiceCallHistory(
    debtorId: string,
    tenantId: string,
    debtId: string,
    nombre: string,
    montoRaw: string,
    dueDateIso: string,
    empresa: string
  ): Promise<Record<string, string>> {
    const monto = montoEspanol(montoRaw);
    const fecha = fechaEspanol(dueDateIso);

    // Unified debtor context — enriches Vapi variables with cross-channel profile
    const ctx = await this.debtorMemory.getUnifiedContext(tenantId, debtorId);

    const contacts = await this.prisma.contact.findMany({
      where: { debtorId, tenantId, deletedAt: null, status: "completed" },
      orderBy: { endedAt: "desc" },
      take: 10
    });

    const pendingPromise = await this.prisma.promiseToPay.findFirst({
      where: { debtId, tenantId, status: "pending", deletedAt: null },
      orderBy: { promisedDate: "asc" }
    });

    const brokenCount = await this.prisma.promiseToPay.count({
      where: { debtId, tenantId, status: "broken", deletedAt: null }
    });

    const count = contacts.length;
    const lastContact = contacts[0];
    const daysAgo = lastContact?.endedAt
      ? Math.floor((Date.now() - new Date(lastContact.endedAt).getTime()) / 86400000)
      : null;

    let firstMessage: string;
    if (count === 0) {
      firstMessage = `Hola, ¿es usted ${nombre}? Le habla Carlos de ${empresa}. Le llamo porque tiene una deuda de ${monto} con fecha límite el ${fecha}. ¿Cómo podemos ayudarle a resolver esta situación?`;
    } else if (pendingPromise) {
      const fechaPromesa = fechaEspanol(new Date(pendingPromise.promisedDate).toISOString());
      firstMessage = `Hola ${nombre}, le llama Carlos de ${empresa}. Le contacto porque usted prometió realizar un pago el ${fechaPromesa} y quería confirmar si pudo realizarlo.`;
    } else if (brokenCount > 0) {
      firstMessage = `Hola ${nombre}, soy Carlos de ${empresa}. Hemos hablado anteriormente sobre su deuda de ${monto}. Entiendo que las cosas no siempre salen como planeamos, ¿podemos encontrar juntos una solución?`;
    } else {
      firstMessage = `Hola ${nombre}, soy Carlos de ${empresa}. Le llamo de nuevo respecto a su deuda de ${monto} con vencimiento el ${fecha}. ¿Tiene un momento para hablar?`;
    }

    const pendingDebtsText = (ctx.emotionalProfile?.pendingDebts ?? [])
      .map((d) => {
        const ref = d.externalRef ?? "deuda";
        const amt = `$${d.amountOutstanding.toLocaleString("es-CO")} ${d.currency}`;
        return `${ref} por ${amt} (vence ${d.dueDate})`;
      })
      .join(", ");

    return {
      es_seguimiento: count > 0 ? "true" : "false",
      contactos_previos: String(count),
      dias_ultimo_contacto: daysAgo !== null ? String(daysAgo) : "",
      tiene_promesa_pendiente: pendingPromise ? "true" : "false",
      promesas_rotas: String(brokenCount),
      first_message_override: firstMessage,
      // Unified debtor profile from cross-channel memory
      perfil_deudor: ctx.emotionalProfile?.summary ?? "",
      sentimiento_previo: ctx.emotionalProfile?.sentiment ?? "neutral",
      comportamiento_pago: ctx.emotionalProfile?.paymentBehavior ?? "desconocido",
      deudas_pendientes: pendingDebtsText
    };
  }

  private buildVariables(
    debt: Debt,
    debtor: Debtor,
    empresa: string
  ): Record<string, string> {
    const paymentBase =
      this.config.get<string>("PAYMENT_LINK_BASE_URL") ??
      "http://localhost:3001/pay";

    const outstanding = decimalToNumber(debt.amountOutstanding);
    const original = decimalToNumber(debt.amountOriginal);
    const currency = debt.currency ?? "COP";
    const due = new Date(debt.dueDate);
    const diasMora = Number.isNaN(due.getTime())
      ? 0
      : Math.max(
          0,
          Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24))
        );

    // Descuento por pronto pago importado del archivo (guardado en metadata).
    const meta = (debt.metadata ?? {}) as Record<string, unknown>;
    const discountPct = Number(meta.discount_percentage);
    const discountDate =
      typeof meta.discount_expiration_date === "string"
        ? meta.discount_expiration_date
        : "";
    const hasDiscount = Number.isFinite(discountPct) && discountPct > 0;
    const discountAmount = hasDiscount
      ? Math.round(outstanding * (discountPct / 100))
      : 0;
    const discountFinal = hasDiscount ? outstanding - discountAmount : outstanding;

    return {
      nombre: debtor.name,
      debtor_name: debtor.name,
      monto: String(outstanding),
      amount: String(outstanding),
      monto_formato: `${formatMoney(outstanding)} ${currency}`,
      monto_original: String(original),
      moneda: currency,
      dias_mora: String(diasMora),
      empresa,
      link_pago: `${paymentBase}/${debt.id}`,
      payment_link: `${paymentBase}/${debt.id}`,
      external_ref: debt.externalRef ?? debt.id,
      due_date: due.toISOString(),
      fecha_vencimiento: formatDate(due),
      installments: "3",
      link: `${paymentBase}/${debt.id}`,
      days: "15",
      // Descuento por pronto pago (vacío cuando la deuda no lo trae).
      discount_enabled: hasDiscount ? "true" : "false",
      discount_percentage: hasDiscount ? String(discountPct) : "",
      descuento_pronto_pago: hasDiscount ? `${discountPct}%` : "",
      discount_amount: hasDiscount ? String(discountAmount) : "",
      discount_amount_formato: hasDiscount
        ? `${formatMoney(discountAmount)} ${currency}`
        : "",
      discount_final_amount: hasDiscount ? String(discountFinal) : "",
      discount_final_amount_formato: hasDiscount
        ? `${formatMoney(discountFinal)} ${currency}`
        : "",
      discount_expiration_date: discountDate,
      fecha_limite_pronto_pago: discountDate ? formatDate(discountDate) : ""
    };
  }

  private async resolveTemplate(
    tenantId: string,
    channel: ContactChannel,
    templateId?: string,
    hint?: string
  ): Promise<NotificationTemplate | null> {
    if (templateId) {
      const found = await this.prisma.notificationTemplate.findFirst({
        where: { id: templateId, tenantId, deletedAt: null }
      });
      if (found) return found;
    }

    const nameHint =
      hint === "workflow_automation"
        ? "recordatorio"
        : hint === "agradecimiento"
          ? "agradecimiento"
          : hint;
    if (nameHint) {
      const byName = await this.prisma.notificationTemplate.findFirst({
        where: {
          tenantId,
          channel,
          deletedAt: null,
          isApproved: true,
          name: { contains: nameHint, mode: "insensitive" }
        }
      });
      if (byName) return byName;
    }

    return this.prisma.notificationTemplate.findFirst({
      where: { tenantId, channel, deletedAt: null, isApproved: true },
      orderBy: { createdAt: "asc" }
    });
  }

  private availableChannels(debtor: Debtor): ContactChannel[] {
    const channels: ContactChannel[] = [];
    if (debtor.whatsappOptIn && phonesFromDebtor(debtor.phones).length > 0) {
      channels.push("whatsapp");
    }
    if (phonesFromDebtor(debtor.phones).length > 0) {
      channels.push("voice");
      if (this.config.get<string>("FEATURE_SMS_ENABLED") === "true") {
        channels.push("sms");
      }
    }
    if (debtor.email) {
      channels.push("email");
    }
    return channels;
  }

  private async getDebtContext(tenantId: string, debtId: string) {
    const debt = await this.prisma.debt.findFirst({
      where: { id: debtId, tenantId, deletedAt: null },
      include: { debtor: true, tenant: { select: { name: true } } }
    });
    if (!debt) {
      throw new NotFoundException("Deuda no encontrada");
    }
    return debt;
  }
}
