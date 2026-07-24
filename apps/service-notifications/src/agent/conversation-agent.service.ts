import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import {
  PrismaService,
  ConversationStatus,
  ContactChannel,
  type Debt
} from "@cobrai/db";
import { ComplianceService } from "@cobrai/compliance";
import { KafkaService } from "../kafka/kafka.service";
import { TwilioWhatsAppAdapter } from "../adapters/twilio-whatsapp.adapter";
import { EmailAdapter } from "../adapters/email.adapter";
import { buildInstallmentSchedule } from "@cobrai/utils";
import { buildSystemPrompt } from "./prompts/cobrai-system.prompt";
import { DebtorMemoryService } from "../memory/debtor-memory.service";
import { PaymentPlanService } from "./payment-plan.service";
import { EMAIL_REPLY_TO } from "../common/email.constants";

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
  /**
   * Cuentas (refs, tal como aparecen en el listado del prompt) a las que el deudor
   * confirmó EXPLÍCITAMENTE aplicar la acción (promesa/plan/disputa). Vacío/null
   * mientras el agente aún está preguntando "¿a cuál cuenta?" — sin esto (y sin
   * apply_to_all) el backend NO aplica la acción cuando hay varias cuentas.
   */
  target_accounts?: string[] | null;
  /** El deudor pidió aplicar la acción a TODAS sus cuentas activas. */
  apply_to_all?: boolean | null;
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
    private readonly paymentPlans: PaymentPlanService,
    private readonly compliance: ComplianceService
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

    // La cuenta principal (mayor saldo) ancla el contexto por defecto y la escalación;
    // las acciones (promesa/plan/disputa) se aplican a la(s) cuenta(s) que el deudor
    // confirme (ver resolveTargetDebts / applyIntent), no siempre a esta.
    const debt = debtor.debts[0];
    if (!debt) {
      this.logger.warn(`Sin deuda activa para deudor ${debtor_id}`);
      return;
    }

    // El STOP/opt-out del mensaje actual ya lo filtra el webhook con una regex exacta
    // antes de llegar aquí; esto cubre el resto de casos (opt-out global, opt-out de
    // OTRO canal, consentimiento revocado) que no dependen de las palabras del mensaje
    // entrante. Se corta antes de llamar a OpenAI para no gastar tokens en un deudor
    // al que no le podemos responder.
    const channel = payload.channel ?? "whatsapp";
    const eligible = await this.compliance.isChannelEligible({
      tenantId: tenant_id,
      debtorId: debtor_id,
      channel
    });
    if (!eligible.allowed) {
      this.logger.warn(
        `Agente bloqueado por compliance debtor=${debtor_id} channel=${channel} reason=${eligible.reason}`
      );
      return;
    }

    const payBase =
      this.config.get<string>("PAYMENT_LINK_BASE_URL") ?? "http://localhost:3001/pay";

    // Resumen de todas las cuentas activas para el contexto del prompt (cada una con
    // su propio enlace de pago, para que el agente envíe solo el de la cuenta confirmada).
    const accounts = debtor.debts.map((d) => ({
      ref: d.externalRef ?? d.id.slice(0, 8),
      amountStr: `${d.currency} ${Number(d.amountOutstanding).toLocaleString("es-CO")}`,
      dueDate: new Date(d.dueDate).toLocaleDateString("es-CO"),
      status: d.status,
      paymentLink: `${payBase}/${d.id}`
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
      paymentLink: `${payBase}/${debt.id}`,
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

    // 7. Acciones según intent — sobre la(s) cuenta(s) que el deudor confirmó.
    //    Con una sola cuenta activa, es esa; con varias, solo las de target_accounts
    //    / apply_to_all. Si hay varias y ninguna confirmada, no se aplica nada (el
    //    agente está preguntando cuál) — evita marcar la deuda equivocada.
    const targets = this.resolveTargetDebts(agentResponse, debtor.debts);
    await this.applyIntent(agentResponse, targets, {
      tenant_id,
      primary_debt_id: debt.id,
      debtor_id,
      conversation_id,
      channel: (payload.channel ?? "whatsapp") as ContactChannel
    });
  }

  /**
   * Resuelve a qué deudas aplica una acción (promesa/plan/disputa) cuando el deudor
   * tiene varias cuentas. Con una sola cuenta activa, es esa (sin desambiguar). Con
   * varias: todas si `apply_to_all`, o las que matcheen `target_accounts` por
   * `external_ref` o prefijo de id; si no hay ninguna confirmada, devuelve [] y la
   * acción no se aplica (el agente aún está preguntando).
   */
  private resolveTargetDebts(response: AgentResponse, activeDebts: Debt[]): Debt[] {
    if (activeDebts.length <= 1) return activeDebts;
    if (response.apply_to_all) return activeDebts;
    const refs = (response.target_accounts ?? [])
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);
    if (refs.length === 0) return [];
    return activeDebts.filter((d) => {
      const ext = (d.externalRef ?? "").trim().toLowerCase();
      const idPrefix = d.id.slice(0, 8).toLowerCase();
      return refs.some(
        (r) => r === ext || r === idPrefix || r === d.id.toLowerCase()
      );
    });
  }

  private async applyIntent(
    response: AgentResponse,
    targets: Debt[],
    ctx: {
      tenant_id: string;
      debtor_id: string;
      conversation_id: string;
      channel: ContactChannel;
      /** Cuenta principal (mayor saldo): contexto de la escalación, no de las acciones. */
      primary_debt_id: string;
    }
  ): Promise<void> {
    switch (response.intent) {
      case "promise_to_pay": {
        if (targets.length === 0) {
          this.logger.log(
            `promise_to_pay sin cuenta confirmada (deudor ${ctx.debtor_id}) — el agente está desambiguando; no se registra promesa`
          );
          break;
        }
        for (const t of targets) {
          // Con una sola cuenta objetivo usamos el monto que dijo el deudor; con
          // varias, cada cuenta promete su propio saldo.
          const amount =
            targets.length === 1
              ? response.promise_amount ?? 0
              : Number(t.amountOutstanding);
          await this.prisma.debt.updateMany({
            where: { id: t.id, tenantId: ctx.tenant_id },
            data: { status: "promised" }
          });
          if (response.promise_date) {
            await this.prisma.promiseToPay.create({
              data: {
                tenantId: ctx.tenant_id,
                debtId: t.id,
                amount,
                promisedDate: new Date(response.promise_date),
                status: "pending"
              }
            });
          }
          await this.kafka.publish(
            "cobrai.debt.promise_registered",
            ctx.tenant_id,
            {
              debt_id: t.id,
              channel: ctx.channel,
              promise_date: response.promise_date ?? null,
              promise_amount: amount
            }
          );
        }
        break;
      }

      case "dispute": {
        if (targets.length === 0) {
          this.logger.log(
            `dispute sin cuenta confirmada (deudor ${ctx.debtor_id}) — el agente está desambiguando; no se marca disputa`
          );
          break;
        }
        for (const t of targets) {
          await this.prisma.debt.updateMany({
            where: { id: t.id, tenantId: ctx.tenant_id },
            data: { status: "disputed" }
          });
          await this.kafka.publish("cobrai.debt.disputed", ctx.tenant_id, {
            debt_id: t.id,
            channel: ctx.channel
          });
        }
        break;
      }

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
            debt_id: ctx.primary_debt_id,
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

      case "plan_request": {
        if (targets.length === 0) {
          this.logger.log(
            `plan_request sin cuenta confirmada (deudor ${ctx.debtor_id}) — el agente está desambiguando; no se crea plan`
          );
          break;
        }
        // Un plan por cada cuenta confirmada, repartiendo el saldo de esa cuenta.
        for (const t of targets) {
          await this.registerPaymentPlan(response, {
            tenant_id: ctx.tenant_id,
            debt_id: t.id,
            channel: ctx.channel,
            amount_outstanding: Number(t.amountOutstanding)
          });
        }
        break;
      }

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
