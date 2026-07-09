import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { PrismaService, ConversationStatus, ContactChannel } from "@cobrai/db";
import { KafkaService } from "../kafka/kafka.service";
import { TwilioWhatsAppAdapter } from "../adapters/twilio-whatsapp.adapter";
import { EmailAdapter } from "../adapters/email.adapter";
import { buildInstallmentSchedule } from "@cobrai/utils";
import { buildSystemPrompt } from "./prompts/cobrai-system.prompt";
import { DebtorMemoryService } from "../memory/debtor-memory.service";
import { PaymentPlanService } from "./payment-plan.service";

/** Reply-To address for outbound agent emails (fixed for v1). */
const EMAIL_REPLY_TO = "reply@reply.fogging.org";

export interface InboundMessagePayload {
  debtor_id: string;
  tenant_id: string;
  conversation_id: string;
  /**
   * For channel "whatsapp": the debtor's phone number (e.g. +573001234567).
   * For channel "email": the debtor's email address (field reused for backward compatibility).
   */
  phone: string;
  body: string;
  message_sid?: string;
  /** Originating channel. Defaults to "whatsapp" when absent. */
  channel?: "whatsapp" | "email";
}

interface AgentResponse {
  intent:
    | "promise_to_pay"
    | "dispute"
    | "plan_request"
    | "escalate_human"
    | "payment_confirmed"
    | "opt_out"
    | "unrelated";
  response: string;
  promise_date?: string | null;
  promise_amount?: number | null;
  /** Plan en cuotas explícito acordado con el deudor. */
  installments?: Array<{ date: string; amount: number }> | null;
  /** Alternativa: número de cuotas para repartir el saldo por igual. */
  installments_count?: number | null;
  /** Fecha de la primera cuota (YYYY-MM-DD) cuando se usa installments_count. */
  first_payment_date?: string | null;
  /** Días entre cuotas (por defecto 30). */
  interval_days?: number | null;
}

const FALLBACK_RESPONSE: AgentResponse = {
  intent: "unrelated",
  response:
    "Gracias por su mensaje. Un agente de CobraAI se comunicará con usted pronto."
};

@Injectable()
export class ConversationAgentService {
  private readonly logger = new Logger(ConversationAgentService.name);
  private readonly openai: OpenAI | null;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaService,
    private readonly whatsapp: TwilioWhatsAppAdapter,
    private readonly debtorMemory: DebtorMemoryService,
    private readonly email: EmailAdapter,
    private readonly paymentPlans: PaymentPlanService
  ) {
    const apiKey = config.get<string>("OPENAI_API_KEY");
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    if (!this.openai) {
      this.logger.warn(
        "OPENAI_API_KEY no configurada: agente conversacional en modo fallback"
      );
    }
    this.model = config.get<string>("OPENAI_MODEL") ?? "gpt-4o-mini";
    this.maxTokens = Number(config.get<string>("OPENAI_MAX_TOKENS") ?? "500");
  }

  async processInboundMessage(payload: InboundMessagePayload): Promise<void> {
    const { debtor_id, tenant_id, conversation_id, phone, body } = payload;

    // 1. Cargar deudor + TODAS sus deudas activas (no solo la principal): el agente
    //    debe poder enumerarlas cuando el deudor pregunte "¿cuáles son mis deudas?".
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtor_id, tenantId: tenant_id, deletedAt: null },
      include: {
        debts: {
          where: {
            tenantId: tenant_id,
            deletedAt: null,
            status: {
              notIn: [
                "paid_full",
                "written_off",
                "disputed",
                "legal",
                "legal_risk"
              ]
            }
          },
          orderBy: { amountOutstanding: "desc" }
        },
        tenant: { select: { name: true } }
      }
    });

    if (!debtor) {
      this.logger.warn(`Deudor ${debtor_id} no encontrado`);
      return;
    }

    // La cuenta principal (mayor saldo) ancla el enlace de pago y las acciones de intent.
    const debt = debtor.debts[0];
    if (!debt) {
      this.logger.warn(`Sin deuda activa para deudor ${debtor_id}`);
      return;
    }

    // Resumen de todas las cuentas activas para el contexto del prompt.
    const accounts = debtor.debts.map((d) => ({
      ref: d.externalRef ?? d.id.slice(0, 8),
      amountStr: `${d.currency} ${Number(d.amountOutstanding).toLocaleString("es-CO")}`,
      dueDate: new Date(d.dueDate).toLocaleDateString("es-CO"),
      status: d.status
    }));
    const totalOutstanding = debtor.debts.reduce(
      (sum, d) => sum + Number(d.amountOutstanding),
      0
    );

    // 2. Historial de mensajes (últimos 20)
    const history = await this.prisma.message.findMany({
      where: { conversationId: conversation_id, deletedAt: null },
      orderBy: { sentAt: "desc" },
      take: 20
    });
    const chronological = history.reverse();

    // 3. Cargar contexto unificado del deudor (cross-canal via DebtorMemoryService)
    const unifiedContext = await this.debtorMemory.getUnifiedContext(tenant_id, debtor_id, debt.id);

    // La lista completa de `accounts` (arriba) ya es la fuente autoritativa de las deudas
    // activas; limpiamos el subconjunto cacheado en el perfil para no mostrar dos listas.
    unifiedContext.debtorHistory.pendingDebts = [];

    // 4. Construir messages para OpenAI
    const systemPrompt = buildSystemPrompt({
      debtorName: debtor.name,
      companyName: debtor.tenant?.name ?? "CobraAI",
      amount: String(debt.amountOutstanding),
      currency: debt.currency,
      dueDate: new Date(debt.dueDate).toLocaleDateString("es-CO"),
      paymentLink: `${this.config.get<string>("PAYMENT_LINK_BASE_URL") ?? "http://localhost:3001/pay"}/${debt.id}`,
      debtStatus: debt.status,
      accounts,
      totalOutstandingStr: `${debt.currency} ${totalOutstanding.toLocaleString("es-CO")}`,
      debtorHistory: unifiedContext.debtorHistory
    });

    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...chronological.map((m) => ({
        role:
          m.direction === "out"
            ? ("assistant" as const)
            : ("user" as const),
        content: this.extractText(m.content)
      })),
      { role: "user", content: body }
    ];

    // 4. Llamar a GPT (o fallback si no hay API key)
    let agentResponse: AgentResponse = FALLBACK_RESPONSE;
    if (this.openai) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: this.model,
          messages: chatMessages,
          max_tokens: this.maxTokens,
          response_format: { type: "json_object" },
          temperature: 0.7
        });
        const raw = completion.choices[0]?.message?.content ?? "{}";
        agentResponse = JSON.parse(raw) as AgentResponse;
        if (!agentResponse.intent) {
          agentResponse = FALLBACK_RESPONSE;
        }
      } catch (err: unknown) {
        this.logger.error(`OpenAI error: ${String(err)}`);
      }
    }

    this.logger.log(
      `Intent: ${agentResponse.intent} para deudor ${debtor_id}`
    );

    // 5. Guardar respuesta outbound en BD
    await this.prisma.message.create({
      data: {
        tenantId: tenant_id,
        conversationId: conversation_id,
        direction: "out",
        channel: payload.channel ?? "whatsapp",
        content: JSON.stringify({
          text: agentResponse.response,
          intent: agentResponse.intent,
          ai_generated: true
        }),
        status: "sent",
        sentAt: new Date()
      }
    });

    // 6. Enviar respuesta por el canal correcto (excepto opt_out)
    if (agentResponse.intent !== "opt_out") {
      if ((payload.channel ?? "whatsapp") === "email") {
        await this.email.sendTemplate({
          to: phone, // for email channel, "phone" carries the debtor's email address
          template_id: "agent_response",
          variables: { body: agentResponse.response },
          tenant_id,
          reply_to: EMAIL_REPLY_TO
        });
      } else {
        await this.whatsapp.sendTemplate({
          to: phone,
          template_id: "agent_response",
          variables: { body: agentResponse.response },
          tenant_id
        });
      }
    }

    // 7. Acciones según intent
    await this.applyIntent(agentResponse, {
      tenant_id,
      debt_id: debt.id,
      debtor_id,
      conversation_id,
      channel: (payload.channel ?? "whatsapp") as ContactChannel,
      amount_outstanding: Number(debt.amountOutstanding)
    });
  }

  private async applyIntent(
    response: AgentResponse,
    ctx: {
      tenant_id: string;
      debt_id: string;
      debtor_id: string;
      conversation_id: string;
      channel: ContactChannel;
      amount_outstanding: number;
    }
  ): Promise<void> {
    switch (response.intent) {
      case "promise_to_pay":
        await this.prisma.debt.updateMany({
          where: { id: ctx.debt_id, tenantId: ctx.tenant_id },
          data: { status: "promised" }
        });
        if (response.promise_date) {
          await this.prisma.promiseToPay.create({
            data: {
              tenantId: ctx.tenant_id,
              debtId: ctx.debt_id,
              amount: response.promise_amount ?? 0,
              promisedDate: new Date(response.promise_date),
              status: "pending"
            }
          });
        }
        await this.kafka.publish(
          "cobrai.debt.promise_registered",
          ctx.tenant_id,
          {
            debt_id: ctx.debt_id,
            channel: ctx.channel,
            promise_date: response.promise_date ?? null,
            promise_amount: response.promise_amount ?? null
          }
        );
        break;

      case "dispute":
        await this.prisma.debt.updateMany({
          where: { id: ctx.debt_id, tenantId: ctx.tenant_id },
          data: { status: "disputed" }
        });
        await this.kafka.publish("cobrai.debt.disputed", ctx.tenant_id, {
          debt_id: ctx.debt_id,
          channel: ctx.channel
        });
        break;

      case "escalate_human":
        await this.prisma.conversation.update({
          where: { id: ctx.conversation_id },
          data: { status: ConversationStatus.escalated }
        });
        await this.kafka.publish(
          "cobrai.escalation.requested",
          ctx.tenant_id,
          {
            conversation_id: ctx.conversation_id,
            debt_id: ctx.debt_id,
            debtor_id: ctx.debtor_id,
            channel: ctx.channel,
            reason: "deudor_solicito_humano"
          }
        );
        break;

      case "opt_out":
        await this.prisma.contactConsent.updateMany({
          where: {
            tenantId: ctx.tenant_id,
            debtorId: ctx.debtor_id,
            channel: ctx.channel,
            revokedAt: null,
            deletedAt: null
          },
          data: { revokedAt: new Date() }
        });
        break;

      case "plan_request":
        await this.registerPaymentPlan(response, ctx);
        break;

      default:
        // unrelated, payment_confirmed — solo registrado en BD
        break;
    }
  }

  /**
   * Crea un plan de cuotas a partir de lo acordado. Acepta cuotas explícitas
   * (fechas + montos) o un número de cuotas para repartir el saldo por igual.
   */
  private async registerPaymentPlan(
    response: AgentResponse,
    ctx: {
      tenant_id: string;
      debt_id: string;
      channel: ContactChannel;
      amount_outstanding: number;
    }
  ): Promise<void> {
    let installments;
    if (response.installments && response.installments.length > 0) {
      installments = response.installments.map((c, i) => ({
        installmentNumber: i + 1,
        amount: c.amount,
        dueDate: c.date
      }));
    } else if (response.installments_count && response.first_payment_date) {
      installments = buildInstallmentSchedule({
        totalAmount: ctx.amount_outstanding,
        installmentsCount: response.installments_count,
        firstDueDate: response.first_payment_date,
        intervalDays: response.interval_days ?? 30
      });
    } else {
      this.logger.warn(
        `plan_request sin datos de cuotas para deuda ${ctx.debt_id} — no se crea plan`
      );
      return;
    }

    const planId = await this.paymentPlans.createPlan(ctx.tenant_id, {
      debtId: ctx.debt_id,
      installments,
      createdVia: ctx.channel
    });
    if (!planId) {
      this.logger.warn(
        `plan_request con cuotas insuficientes para deuda ${ctx.debt_id} — no se crea plan`
      );
    }
  }

  private extractText(content: string): string {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      return (
        String(parsed["text"] ?? parsed["body"] ?? content).substring(0, 500)
      );
    } catch {
      return content.substring(0, 500);
    }
  }
}
