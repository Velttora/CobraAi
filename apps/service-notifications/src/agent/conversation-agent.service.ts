import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { PrismaService } from "@cobrai/db";
import { ConversationStatus } from "@cobrai/db";
import { KafkaService } from "../kafka/kafka.service";
import { TwilioWhatsAppAdapter } from "../adapters/twilio-whatsapp.adapter";
import { buildSystemPrompt } from "./prompts/cobrai-system.prompt";
import { DebtorMemoryService } from "../memory/debtor-memory.service";

export interface InboundMessagePayload {
  debtor_id: string;
  tenant_id: string;
  conversation_id: string;
  phone: string;
  body: string;
  message_sid?: string;
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
    private readonly debtorMemory: DebtorMemoryService
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

    // 1. Cargar deudor + deuda activa
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
          orderBy: { amountOutstanding: "desc" },
          take: 1
        }
      }
    });

    if (!debtor) {
      this.logger.warn(`Deudor ${debtor_id} no encontrado`);
      return;
    }

    const debt = debtor.debts[0];
    if (!debt) {
      this.logger.warn(`Sin deuda activa para deudor ${debtor_id}`);
      return;
    }

    // 2. Historial de mensajes (últimos 20)
    const history = await this.prisma.message.findMany({
      where: { conversationId: conversation_id, deletedAt: null },
      orderBy: { sentAt: "desc" },
      take: 20
    });
    const chronological = history.reverse();

    // 3. Cargar contexto unificado del deudor (cross-canal via DebtorMemoryService)
    const unifiedContext = await this.debtorMemory.getUnifiedContext(tenant_id, debtor_id, debt.id);

    // 4. Construir messages para OpenAI
    const systemPrompt = buildSystemPrompt({
      debtorName: debtor.name,
      companyName: "CobraAI Demo",
      amount: String(debt.amountOutstanding),
      currency: debt.currency,
      dueDate: new Date(debt.dueDate).toLocaleDateString("es-CO"),
      paymentLink: `${this.config.get<string>("PAYMENT_LINK_BASE_URL") ?? "http://localhost:3001/pay"}/${debt.id}`,
      debtStatus: debt.status,
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
        channel: "whatsapp",
        content: JSON.stringify({
          text: agentResponse.response,
          intent: agentResponse.intent,
          ai_generated: true
        }),
        status: "sent",
        sentAt: new Date()
      }
    });

    // 6. Enviar respuesta por WhatsApp (excepto opt_out)
    if (agentResponse.intent !== "opt_out") {
      await this.whatsapp.sendTemplate({
        to: phone,
        template_id: "agent_response",
        variables: { body: agentResponse.response },
        tenant_id
      });
    }

    // 7. Acciones según intent
    await this.applyIntent(agentResponse, {
      tenant_id,
      debt_id: debt.id,
      debtor_id,
      conversation_id
    });
  }

  private async applyIntent(
    response: AgentResponse,
    ctx: {
      tenant_id: string;
      debt_id: string;
      debtor_id: string;
      conversation_id: string;
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
            channel: "whatsapp",
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
          channel: "whatsapp"
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
            debt_id: ctx.debt_id,
            debtor_id: ctx.debtor_id,
            channel: "whatsapp",
            reason: "deudor_solicito_humano"
          }
        );
        break;

      case "opt_out":
        await this.prisma.contactConsent.updateMany({
          where: {
            tenantId: ctx.tenant_id,
            debtorId: ctx.debtor_id,
            channel: "whatsapp",
            revokedAt: null,
            deletedAt: null
          },
          data: { revokedAt: new Date() }
        });
        break;

      default:
        // unrelated, plan_request, payment_confirmed — solo registrado en BD
        break;
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
