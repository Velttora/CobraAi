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
  buildMessageContent,
  decimalToNumber,
  fechaEspanol,
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

  async list(tenantId: string, debtId?: string, channel?: ContactChannel) {
    const items = await this.prisma.contact.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(debtId ? { debtId } : {}),
        ...(channel ? { channel } : {})
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        debtor: { select: { id: true, name: true } }
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

    const variables = this.buildVariables(debt, debtor);
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
        // Sin template, construir un correo bien formado (no el fallback genérico).
        const emailBody = template
          ? body
          : this.buildDefaultEmailBody(debtor, variables);
        const subject = template
          ? "Recordatorio CobraAI"
          : `Recordatorio de pago — ${variables.empresa ?? "CobraAI"}`;
        const result = await this.email.sendTemplate({
          to,
          template_id: template?.id ?? "default",
          variables: { ...variables, body: emailBody, subject },
          tenant_id: tenantId
        });
        return { messageId: result.message_id, status: result.status, body: emailBody };
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
        const callHistory = await this.loadVoiceCallHistory(debtor.id, tenantId, debt.id, debtor.name, String(decimalToNumber(debt.amountOutstanding)), new Date(debt.dueDate).toISOString());
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

  /** Cuerpo HTML de email por defecto cuando no hay template aprobado (envío automático). */
  private buildDefaultEmailBody(
    debtor: Debtor,
    variables: Record<string, string>
  ): string {
    const nombre = debtor.name.split(" ")[0] || "estimado/a";
    const montoNum = Number(variables.amount ?? variables.monto ?? 0);
    const monto =
      Number.isFinite(montoNum) && montoNum > 0
        ? `$${montoNum.toLocaleString("es-CO")} COP`
        : (variables.amount ?? "su saldo pendiente");
    const fecha = this.formatDateEs(variables.due_date);
    const link =
      variables.link_pago ?? variables.payment_link ?? variables.link ?? "";
    const empresa = variables.empresa ?? "CobraAI";
    const fechaLine = fecha ? ` con vencimiento el <strong>${fecha}</strong>` : "";
    const linkBtn = link
      ? `<p style="text-align:center;margin:24px 0"><a href="${link}" style="background:#1a73e8;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block">Pagar ahora</a></p>`
      : "";
    return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#333">
  <div style="background:#1a73e8;padding:18px 24px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0;font-size:18px">${empresa}</h2></div>
  <div style="padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
    <p>Hola ${nombre},</p>
    <p>Le escribimos de <strong>${empresa}</strong> para recordarle de manera cordial que registra un <strong>saldo pendiente de ${monto}</strong>${fechaLine}.</p>
    <p>Queremos ayudarle a resolverlo de la forma más conveniente para usted.</p>
    ${linkBtn}
    <p style="font-size:13px;color:#666">Si ya realizó el pago, ignore este mensaje; puede tardar 24-48h en reflejarse.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
    <p style="font-size:11px;color:#999">Gestión de cobranza conforme a la Ley 1266 de 2008 (Habeas Data). Si no desea recibir más comunicaciones, responda este correo solicitando su exclusión.</p>
  </div>
</div>`;
  }

  /** Formatea una fecha ISO a "15 de junio de 2026". Cadena vacía si es inválida. */
  private formatDateEs(iso?: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const meses = [
      "enero", "febrero", "marzo", "abril", "mayo", "junio",
      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
    ];
    return `${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
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
    dueDateIso: string
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
      firstMessage = `Hola, ¿es usted ${nombre}? Le habla Carlos de CobraAI. Le llamo porque tiene una deuda de ${monto} con fecha límite el ${fecha}. ¿Cómo podemos ayudarle a resolver esta situación?`;
    } else if (pendingPromise) {
      const fechaPromesa = fechaEspanol(new Date(pendingPromise.promisedDate).toISOString());
      firstMessage = `Hola ${nombre}, le llama Carlos de CobraAI. Le contacto porque usted prometió realizar un pago el ${fechaPromesa} y quería confirmar si pudo realizarlo.`;
    } else if (brokenCount > 0) {
      firstMessage = `Hola ${nombre}, soy Carlos de CobraAI. Hemos hablado anteriormente sobre su deuda de ${monto}. Entiendo que las cosas no siempre salen como planeamos, ¿podemos encontrar juntos una solución?`;
    } else {
      firstMessage = `Hola ${nombre}, soy Carlos de CobraAI. Le llamo de nuevo respecto a su deuda de ${monto} con vencimiento el ${fecha}. ¿Tiene un momento para hablar?`;
    }

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
      comportamiento_pago: ctx.emotionalProfile?.paymentBehavior ?? "desconocido"
    };
  }

  private buildVariables(
    debt: Debt,
    debtor: Debtor
  ): Record<string, string> {
    const paymentBase =
      this.config.get<string>("PAYMENT_LINK_BASE_URL") ??
      "http://localhost:3001/pay";
    return {
      nombre: debtor.name,
      debtor_name: debtor.name,
      monto: String(decimalToNumber(debt.amountOutstanding)),
      amount: String(decimalToNumber(debt.amountOutstanding)),
      empresa: "CobraAI Demo",
      link_pago: `${paymentBase}/${debt.id}`,
      payment_link: `${paymentBase}/${debt.id}`,
      external_ref: debt.externalRef ?? debt.id,
      due_date: new Date(debt.dueDate).toISOString(),
      installments: "3",
      link: `${paymentBase}/${debt.id}`,
      days: "15"
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

    const nameHint = hint === "workflow_automation" ? "recordatorio" : hint;
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
      include: { debtor: true }
    });
    if (!debt) {
      throw new NotFoundException("Deuda no encontrada");
    }
    return debt;
  }
}
