import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createKafkaClient, type KafkaEventEnvelope } from "@cobrai/kafka";
import {
  ContactsService,
  type ContactRequestPayload
} from "../contacts/contacts.service";

const CONSUMED_TOPICS = [
  "cobrai.contact.requested",
  "cobrai.whatsapp.message_received",
  "cobrai.voice.call_completed"
] as const;

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Awaited<
    ReturnType<ReturnType<typeof createKafkaClient>["consumer"]>
  > | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly contacts: ContactsService
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
      case "cobrai.whatsapp.message_received":
      case "cobrai.voice.call_completed":
        this.logger.log(`${topic} recibido (stub handler)`, payload);
        break;
      default:
        break;
    }
  }
}
