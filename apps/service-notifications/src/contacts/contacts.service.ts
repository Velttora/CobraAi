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
import { EMAIL_REPLY_TO } from "../common/email.constants";
import { AuditService, ComplianceService, resolveRetryPolicy } from "@cobrai/compliance";
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
  attempt_number?: number;
  previous_channel?: ContactChannel;
  escalation?: "switch_channel" | "same_channel";
};

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
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
        template_hint: payload.template_hint,
        attempt_number: payload.attempt_number
      });
      return;
    }

    const debt = await this.getDebtContext(tenantId, payload.debt_id);
    const channels = this.availableChannels(debt.debtor);
    // Reintento: si la política es "same_channel" reintenta el mismo canal; si no
    // (default "switch_channel" o primer intento), avanza al siguiente canal disponible.
    const channel =
      payload.escalation === "same_channel" && payload.previous_channel
        ? payload.previous_channel
        : this.waterfall.nextChannel(payload.previous_channel ?? null, channels);
    if (!channel) {
      await this.kafka.publish("cobrai.contact.failed.no_response", tenantId, {
        debt_id: payload.debt_id,
        reason: "no_available_channel"
      });
      return;
    }

    await this.executeContact(tenantId, {
      debt_id: payload.debt_id,
      channel,
      template_hint: payload.template_hint,
      attempt_number: payload.attempt_number
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
      attempt_number?: number;
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

      if (
        compliance.reason === "awaiting_response" ||
        compliance.reason === "retry_cooldown"
      ) {
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

    const policy = resolveRetryPolicy(debt.tenant?.settings);
    const attemptNumber = input.attempt_number ?? 1;

    const variables = this.buildVariables(debt, debtor, empresa);
    // Agrupar todas las deudas activas del deudor EN EL MISMO PORTAFOLIO en un
    // solo contacto (email detallado, WhatsApp/voz moderado). Sobrescribe monto
    // por el total para que las plantillas genéricas muestren el agregado.
    Object.assign(
      variables,
      await this.buildGroupVariables(tenantId, debtor.id, debt)
    );
    const contact = await this.prisma.contact.create({
      data: {
        tenantId,
        debtId: debt.id,
        debtorId: debtor.id,
        channel: input.channel,
        status: "in_progress",
        startedAt: at,
        attemptNumber
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

      const sendFailed = sendResult.status === "failed";

      await this.recordConversationMessage(
        tenantId,
        debtor.id,
        debt.id,
        input.channel,
        template,
        variables,
        sendResult.messageId,
        sendResult.body,
        sendResult.status
      );

      const completed = await this.prisma.contact.update({
        where: { id: contact.id },
        data: {
          status: sendFailed ? "failed" : "completed",
          endedAt: new Date(),
          // Un envío fallido nunca llegó al deudor — no tiene sentido esperar respuesta
          // por él; se marca sin_contacto de inmediato para que el reintento no espere
          // la ventana completa por algo que ya sabemos que no se entregó.
          ...(sendFailed
            ? {
                responseStatus: "no_response" as const,
                respondedAt: new Date(),
                nextRetryAt: new Date(
                  Date.now() + policy.windowHours * 60 * 60 * 1000
                )
              }
            : {})
        }
      });

      // Registro (no dispara outcome ni cuenta intentos por sí solo — eso lo decide
      // la respuesta real del deudor o el vencimiento de la ventana, ver §4/§5).
      await this.kafka.publish("cobrai.contact.sent", tenantId, {
        debt_id: debt.id,
        debtor_id: debtor.id,
        contact_id: contact.id,
        channel: input.channel,
        attempt_number: attemptNumber,
        send_failed: sendFailed,
        provider_message_id: sendResult.messageId
      });

      await this.audit.logContactLifecycle({
        tenantId,
        debtorId: debtor.id,
        action: sendFailed ? "compliance.contact.send_failed" : "compliance.contact.sent",
        channel: input.channel,
        attemptNumber,
        maxAttempts: policy.maxAttempts,
        windowHours: policy.windowHours
      });

      if (sendFailed) {
        await this.kafka.publish("cobrai.contact.no_response", tenantId, {
          debt_id: debt.id,
          debtor_id: debtor.id,
          contact_id: contact.id,
          channel: input.channel,
          attempt_number: attemptNumber
        });
      } else {
        // Solo limpiar si el mensaje llegó efectivamente al deudor
        await this.debtorMemory.clearPendingDebts(tenantId, debtor.id);
      }

      return { contact: completed, blocked: false };
    } catch (err) {
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: {
          status: "failed",
          endedAt: new Date(),
          responseStatus: "no_response",
          respondedAt: new Date(),
          nextRetryAt: new Date(Date.now() + policy.windowHours * 60 * 60 * 1000)
        }
      });
      await this.kafka.publish("cobrai.contact.no_response", tenantId, {
        debt_id: debt.id,
        debtor_id: debtor.id,
        contact_id: contact.id,
        channel: input.channel,
        attempt_number: attemptNumber
      });
      throw err;
    }
  }

  /**
   * Marca la respuesta del intento de contacto más reciente del deudor (cualquier
   * deuda/canal — el coordinator ya agrupa las deudas de un deudor en un solo ciclo
   * de contacto activo). Se llama desde las vías inbound: WhatsApp, email y el
   * resultado real de una llamada de voz.
   *
   * Si no hay ningún intento "pending" (el sweep ya venció la ventana y lo cerró
   * como no_response) pero tampoco existe un intento más nuevo todavía, una
   * respuesta tardía del deudor sigue contando como respuesta real — si no, el
   * badge se queda en "sin contacto" y el ciclo de reintento bloquea contactos
   * nuevos (retry_cooldown) pese a que el deudor está conversando en este momento.
   */
  async markResponse(
    tenantId: string,
    debtorId: string,
    status: "effective" | "no_response",
    via: ContactChannel
  ): Promise<void> {
    const pending = await this.prisma.contact.findFirst({
      where: {
        tenantId,
        debtorId,
        deletedAt: null,
        responseStatus: "pending",
        status: { in: ["scheduled", "in_progress", "completed"] }
      },
      orderBy: { createdAt: "desc" }
    });

    const target =
      pending ??
      (await this.prisma.contact.findFirst({
        where: {
          tenantId,
          debtorId,
          deletedAt: null,
          responseStatus: "no_response",
          status: { in: ["scheduled", "in_progress", "completed"] }
        },
        orderBy: { createdAt: "desc" }
      }));
    if (!target) return;

    await this.finalizeResponse(tenantId, target, status, via);
  }

  /**
   * Igual que markResponse, pero apuntando a un Contact ya identificado por id — usado
   * por ContactRetrySweepService para no reconsultar "el más reciente" y arriesgar marcar
   * uno distinto si en el ínterin se creó un intento más nuevo para el mismo deudor.
   */
  async markContactExpired(tenantId: string, contactId: string): Promise<void> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId, deletedAt: null, responseStatus: "pending" }
    });
    if (!contact) return;

    await this.finalizeResponse(tenantId, contact, "no_response");
  }

  private async finalizeResponse(
    tenantId: string,
    pending: { id: string; debtId: string; debtorId: string; channel: ContactChannel; attemptNumber: number },
    status: "effective" | "no_response",
    via?: ContactChannel
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true }
    });
    const policy = resolveRetryPolicy(tenant?.settings);
    const debtorId = pending.debtorId;

    await this.prisma.contact.update({
      where: { id: pending.id },
      data: {
        responseStatus: status,
        respondedAt: new Date(),
        // Persistir el cooldown de reintento: sin esto getRetryState nunca lo aplica
        // y los reintentos se disparan sin espaciado (sobre-contacto).
        ...(status === "no_response"
          ? { nextRetryAt: new Date(Date.now() + policy.windowHours * 60 * 60 * 1000) }
          : {})
      }
    });

    if (status === "effective") {
      await this.debtorMemory.clearPendingDebts(tenantId, debtorId);
      await this.audit.logContactLifecycle({
        tenantId,
        debtorId,
        action: "compliance.contact.effective",
        channel: pending.channel,
        attemptNumber: pending.attemptNumber,
        maxAttempts: policy.maxAttempts,
        respondedVia: via
      });
      await this.kafka.publish("cobrai.contact.effective", tenantId, {
        debt_id: pending.debtId,
        debtor_id: debtorId,
        contact_id: pending.id,
        channel: pending.channel,
        attempt_number: pending.attemptNumber,
        responded_via: via
      });
      return;
    }

    await this.audit.logContactLifecycle({
      tenantId,
      debtorId,
      action: "compliance.contact.no_response",
      channel: pending.channel,
      attemptNumber: pending.attemptNumber,
      maxAttempts: policy.maxAttempts
    });
    await this.kafka.publish("cobrai.contact.no_response", tenantId, {
      debt_id: pending.debtId,
      debtor_id: debtorId,
      contact_id: pending.id,
      channel: pending.channel,
      attempt_number: pending.attemptNumber
    });
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
          tenant_id: tenantId,
          reply_to: EMAIL_REPLY_TO
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
        const callHistory = await this.loadVoiceCallHistory(
          debtor.id,
          tenantId,
          debt.id,
          debtor.name,
          String(decimalToNumber(debt.amountOutstanding)),
          new Date(debt.dueDate).toISOString(),
          variables.empresa ?? "CobraAI",
          Number(variables.cantidad_deudas ?? "1"),
          variables.total_adeudado ?? String(decimalToNumber(debt.amountOutstanding))
        );
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
          // Persist the actual opening line Vapi delivers, not the voice script
          // template (which Vapi ignores — it uses its own assistant prompt).
          body: callHistory.first_message_override ?? "Llamada encolada"
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
    // Agrupado: detalle super específico de cada cuenta + total.
    if (variables.es_agrupado === "true") {
      return (
        `Hola ${nombre},\n\n` +
        `Le recordamos de manera cordial que registra ${variables.cantidad_deudas} cuentas pendientes con nosotros, ` +
        `por un total de ${variables.total_adeudado_formato}. El detalle es el siguiente:\n\n` +
        `${variables.deudas_detalle_email}\n\n` +
        `Queremos ayudarle a resolverlo de la forma más conveniente para usted. ` +
        `Si ya realizó alguno de estos pagos, ignore ese punto; puede tardar 24-48h en reflejarse.`
      );
    }
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
    body: string,
    sendStatus: "sent" | "failed"
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
          // For voice, the template is not what the debtor hears (Vapi drives the
          // call from its own assistant), so rendering it would persist raw script
          // scaffolding and unresolved variables. Store the clean call body instead.
          channel !== "voice" && template
            ? renderTemplate(template.content, variables)
            : body,
          providerMessageId
        ),
        status: sendStatus,
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
    empresa: string,
    grupoCount = 1,
    grupoTotalRaw?: string
  ): Promise<Record<string, string>> {
    const monto = montoEspanol(montoRaw);
    const fecha = fechaEspanol(dueDateIso);
    // Cuando el deudor tiene varias deudas en el portafolio, la llamada se agrupa:
    // Carlos menciona la cantidad de cuentas y el total, no una sola deuda.
    const agrupado = grupoCount > 1;
    const montoGrupo = agrupado ? montoEspanol(grupoTotalRaw ?? montoRaw) : monto;
    const deudaFrase = agrupado
      ? `${grupoCount} cuentas pendientes por un total de ${montoGrupo}`
      : `una deuda de ${monto} con fecha límite el ${fecha}`;

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
      firstMessage = `Hola, ¿es usted ${nombre}? Le habla Carlos de ${empresa}. Le llamo porque tiene ${deudaFrase}. ¿Cómo podemos ayudarle a resolver esta situación?`;
    } else if (pendingPromise) {
      const fechaPromesa = fechaEspanol(new Date(pendingPromise.promisedDate).toISOString());
      firstMessage = `Hola ${nombre}, le llama Carlos de ${empresa}. Le contacto porque usted prometió realizar un pago el ${fechaPromesa} y quería confirmar si pudo realizarlo.`;
    } else if (brokenCount > 0) {
      const refFrase = agrupado ? "sus cuentas pendientes" : `su deuda de ${monto}`;
      firstMessage = `Hola ${nombre}, soy Carlos de ${empresa}. Hemos hablado anteriormente sobre ${refFrase}. Entiendo que las cosas no siempre salen como planeamos, ¿podemos encontrar juntos una solución?`;
    } else {
      firstMessage = `Hola ${nombre}, soy Carlos de ${empresa}. Le llamo de nuevo respecto a ${deudaFrase}. ¿Tiene un momento para hablar?`;
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
    const referencia = debt.externalRef?.trim() || debt.id;

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
      referencia,
      external_ref: referencia,
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

  /**
   * Agrupa todas las deudas activas del deudor EN EL MISMO PORTAFOLIO en un solo
   * contacto. Devuelve variables agregadas (total, cantidad y detalle por canal).
   * Si el deudor tiene una sola deuda en el portafolio, devuelve es_agrupado=false
   * y no altera el mensaje (comportamiento de deuda única intacto).
   */
  private async buildGroupVariables(
    tenantId: string,
    debtorId: string,
    debt: Debt
  ): Promise<Record<string, string>> {
    const group =
      (await this.prisma.debt.findMany({
        where: {
          tenantId,
          debtorId,
          portfolioId: debt.portfolioId,
          deletedAt: null,
          // Solo deudas aún por cobrar (excluye promised/pagadas/legal/disputadas).
          status: {
            in: ["new", "analyzing", "active", "contacted", "upcoming", "legal_risk"]
          }
        },
        orderBy: { dueDate: "asc" }
      })) ?? [];

    if (group.length <= 1) {
      return { es_agrupado: "false", cantidad_deudas: String(group.length || 1) };
    }

    const currency = debt.currency ?? "COP";
    const total = group.reduce(
      (sum, d) => sum + decimalToNumber(d.amountOutstanding),
      0
    );
    // Email: super específico — una línea por cuenta con referencia, monto y vencimiento.
    const detalleEmail = group
      .map((d, i) => {
        const ref = d.externalRef?.trim() || d.id.slice(0, 8);
        const amt = `${formatMoney(decimalToNumber(d.amountOutstanding))} ${d.currency}`;
        const venc = formatDate(new Date(d.dueDate));
        const mora = this.agingLabel(new Date(d.dueDate));
        return `${i + 1}. Cuenta ${ref}: ${amt} — vence ${venc} (${mora})`;
      })
      .join("\n");
    const totalFormato = `${formatMoney(total)} ${currency}`;

    return {
      es_agrupado: "true",
      cantidad_deudas: String(group.length),
      total_adeudado: String(total),
      total_adeudado_formato: totalFormato,
      deudas_detalle_email: detalleEmail,
      // WhatsApp/voz: moderado — solo cantidad + total.
      deudas_resumen_wa: `${group.length} cuentas pendientes por un total de ${totalFormato}`,
      // Sobrescribir monto genérico por el total agregado.
      monto: String(total),
      amount: String(total),
      monto_formato: totalFormato
    };
  }

  /**
   * Etiqueta neutral de mora por cuenta para la notificación agrupada. Tono seguro
   * (Ley 1266): sin jerga interna de aging — solo "por vencer" o los días vencidos.
   */
  private agingLabel(dueDate: Date): string {
    const MS_DAY = 24 * 60 * 60 * 1000;
    const dayIndex = (d: Date) => Math.floor(d.getTime() / MS_DAY);
    const overdue = dayIndex(new Date()) - dayIndex(dueDate);
    if (overdue <= 0) return "por vencer";
    return `vencida hace ${overdue} día${overdue === 1 ? "" : "s"}`;
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
      include: { debtor: true, tenant: { select: { name: true, settings: true } } }
    });
    if (!debt) {
      throw new NotFoundException("Deuda no encontrada");
    }
    return debt;
  }
}
