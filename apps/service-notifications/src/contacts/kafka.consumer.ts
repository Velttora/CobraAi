import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createKafkaClient, type KafkaEventEnvelope } from "@cobrai/kafka";
import {
  ContactsService,
  type ContactRequestPayload
} from "../contacts/contacts.service";
import {
  ConversationAgentService,
  type InboundMessagePayload
} from "../agent/conversation-agent.service";
import { ConversationsService } from "../conversations/conversations.service";
import {
  DebtorContactCoordinatorService,
  type DebtorContactQueuePayload
} from "../orchestrator/debtor-contact-coordinator.service";

const CONSUMED_TOPICS = [
  "cobrai.contact.requested",
  "cobrai.debtor.contact_queue",
  "cobrai.whatsapp.message_received",
  // NOTA: NO consumimos "cobrai.voice.call_completed" aquí. El fin de una llamada
  // lo procesa por completo VapiWebhookHandler (cierra el contacto, marca la
  // respuesta, registra promesa, entrega link) y publica ese evento para OTROS
  // servicios. Re-consumirlo aquí para volver a llamar creaba un loop infinito de
  // re-marcado (cada llamada terminada disparaba otra). El reintento/escalado lo
  // maneja WorkflowsService vía cobrai.contact.no_response / contact.effective.
  "cobrai.email.message_received",
  "cobrai.escalation.requested",
  "cobrai.debt.escalated"
] as const;

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Awaited<
    ReturnType<ReturnType<typeof createKafkaClient>["consumer"]>
  > | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly contacts: ContactsService,
    private readonly coordinator: DebtorContactCoordinatorService,
    private readonly agent: ConversationAgentService,
    private readonly conversations: ConversationsService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get<string>("KAFKA_BROKERS")?.trim()) {
      this.logger.warn("Kafka consumer deshabilitado");
      return;
    }

    const kafka = createKafkaClient({
      clientId: `${this.config.get<string>("KAFKA_CLIENT_ID") ?? "service-notifications"}-consumer`
    });
    this.consumer = kafka.consumer({ groupId: "service-notifications-v1" });
    await this.consumer.connect();

    for (const topic of CONSUMED_TOPICS) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    void this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;
        try {
          const envelope = JSON.parse(
            message.value.toString()
          ) as KafkaEventEnvelope;
          await this.dispatch(topic, envelope);
        } catch (err) {
          this.logger.error(`Error procesando ${topic}`, err);
        }
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
  }

  private async dispatch(
    topic: string,
    envelope: KafkaEventEnvelope
  ): Promise<void> {
    const tenantId = envelope.tenant_id;
    const payload = envelope.payload as Record<string, unknown>;

    switch (topic) {
      case "cobrai.contact.requested":
        await this.contacts.handleContactRequested(
          tenantId,
          payload as ContactRequestPayload
        );
        break;

      case "cobrai.debtor.contact_queue":
        await this.coordinator.handleQueuedRequest(
          tenantId,
          payload as unknown as DebtorContactQueuePayload
        );
        break;
      case "cobrai.whatsapp.message_received":
        await this.agent.processInboundMessage(
          payload as unknown as InboundMessagePayload
        );
        break;
      case "cobrai.email.message_received":
        await this.agent.processInboundMessage(
          payload as unknown as InboundMessagePayload
        );
        break;
      // "cobrai.voice.call_completed" se maneja íntegramente en VapiWebhookHandler
      // (respuesta, promesa, link) y el reintento en WorkflowsService — no re-marcar
      // aquí (causaba un loop de llamadas). Ver nota en CONSUMED_TOPICS.

      case "cobrai.debt.escalated": {
        const target = String(payload["target"] ?? "");
        // task escalations don't require a human inbox entry
        if (target === "task") break;
        const debtId = String(payload["debt_id"] ?? "");
        const ruleName = String(payload["rule_name"] ?? payload["rule_id"] ?? "regla automática");
        await this.conversations.escalateByWorkflow(tenantId, debtId, ruleName);
        break;
      }

      case "cobrai.escalation.requested": {
        // El agente ya marcó la conversación como 'escalated'.
        // Agregamos un mensaje de sistema con el motivo para contexto del agente humano.
        const convId = String(payload["conversation_id"] ?? "");
        const reason = String(payload["reason"] ?? "motivo no especificado");
        if (convId) {
          await this.conversations.addEscalationSystemMessage(tenantId, convId, reason);
        }
        this.logger.warn(
          `⚠️ Escalación a humano — tenant=${tenantId} ` +
            `debt=${String(payload["debt_id"] ?? "?")} ` +
            `canal=${String(payload["channel"] ?? "?")} ` +
            `motivo=${reason}`
        );
        break;
      }

      default:
        break;
    }
  }
}
