import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createKafkaClient, type KafkaEventEnvelope } from "@cobrai/kafka";
import { PaymentEventsService } from "../debts/payment-events.service";
import { IntegrationsService } from "../integrations/integrations.service";

// Topics that trigger outbound webhooks to ERPs
const OUTBOUND_TOPIC_MAP: Record<string, string> = {
  "cobrai.debt.updated": "debt.status_changed",
  "cobrai.payment.confirmed": "payment.confirmed",
  "cobrai.debt.promise_registered": "promise.created",
  "cobrai.debt.promise_broken": "promise.broken",
  "cobrai.contact.completed": "contact.completed"
};

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Awaited<
    ReturnType<ReturnType<typeof createKafkaClient>["consumer"]>
  > | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly payments: PaymentEventsService,
    @Inject(forwardRef(() => IntegrationsService))
    private readonly integrations: IntegrationsService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get<string>("KAFKA_BROKERS")?.trim()) {
      this.logger.warn("Kafka consumer deshabilitado en portfolios");
      return;
    }

    const kafka = createKafkaClient({
      clientId: `${this.config.get<string>("KAFKA_CLIENT_ID") ?? "service-portfolios"}-consumer`
    });
    this.consumer = kafka.consumer({ groupId: "service-portfolios-events-v1" });
    await this.consumer.connect();

    const topics = [
      "cobrai.payment.confirmed",
      "cobrai.debt.updated",
      "cobrai.debt.promise_registered",
      "cobrai.debt.promise_broken",
      "cobrai.contact.completed"
    ];

    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: false });
    }

    void this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;
        try {
          const envelope = JSON.parse(message.value.toString()) as KafkaEventEnvelope;

          // Handle payment confirmed — update debt balances
          if (topic === "cobrai.payment.confirmed") {
            await this.payments.handlePaymentConfirmed(
              envelope.tenant_id,
              envelope.payload as Record<string, unknown>
            );
          }

          // Fire outbound webhook to all active ERP integrations for this tenant
          const outboundEvent = OUTBOUND_TOPIC_MAP[topic];
          if (outboundEvent) {
            await this.integrations.dispatchOutbound(
              envelope.tenant_id,
              outboundEvent as Parameters<IntegrationsService["dispatchOutbound"]>[1],
              envelope.payload
            );
          }
        } catch (err) {
          this.logger.error(`Error procesando ${topic}`, err);
        }
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
  }
}
