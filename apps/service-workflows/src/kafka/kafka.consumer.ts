import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createKafkaClient, type KafkaEventEnvelope } from "@cobrai/kafka";
import { WorkflowsService } from "../workflows/workflows.service";

const CONSUMED_TOPICS = [
  "cobrai.debt.created",
  "cobrai.debt.segmented",
  "cobrai.contact.completed",
  "cobrai.payment.confirmed"
] as const;

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Awaited<
    ReturnType<ReturnType<typeof createKafkaClient>["consumer"]>
  > | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly workflows: WorkflowsService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get<string>("KAFKA_BROKERS")?.trim()) {
      this.logger.warn("Kafka consumer deshabilitado");
      return;
    }

    const kafka = createKafkaClient({
      clientId: `${this.config.get<string>("KAFKA_CLIENT_ID") ?? "service-workflows"}-consumer`
    });
    this.consumer = kafka.consumer({
      groupId: "service-workflows-v1"
    });
    await this.consumer.connect();

    for (const topic of CONSUMED_TOPICS) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    this.running = true;
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
    this.running = false;
    await this.consumer?.disconnect();
  }

  private async dispatch(
    topic: string,
    envelope: KafkaEventEnvelope
  ): Promise<void> {
    const tenantId = envelope.tenant_id;
    const payload = envelope.payload as Record<string, unknown>;

    switch (topic) {
      case "cobrai.debt.created":
        await this.workflows.handleDebtCreated(tenantId, payload);
        break;
      case "cobrai.debt.segmented":
        await this.workflows.handleDebtSegmented(tenantId, payload);
        break;
      case "cobrai.contact.completed":
        await this.workflows.handleContactCompleted(tenantId, payload);
        break;
      case "cobrai.payment.confirmed":
        await this.workflows.handlePaymentConfirmed(tenantId, payload);
        break;
      default:
        break;
    }
  }
}
