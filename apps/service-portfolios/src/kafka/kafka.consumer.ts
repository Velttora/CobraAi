import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createKafkaClient, type KafkaEventEnvelope } from "@cobrai/kafka";
import { PaymentEventsService } from "../debts/payment-events.service";

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Awaited<
    ReturnType<ReturnType<typeof createKafkaClient>["consumer"]>
  > | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly payments: PaymentEventsService
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get<string>("KAFKA_BROKERS")?.trim()) {
      this.logger.warn("Kafka consumer deshabilitado en portfolios");
      return;
    }

    const kafka = createKafkaClient({
      clientId: `${this.config.get<string>("KAFKA_CLIENT_ID") ?? "service-portfolios"}-consumer`
    });
    this.consumer = kafka.consumer({ groupId: "service-portfolios-payments-v1" });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: "cobrai.payment.confirmed",
      fromBeginning: false
    });

    void this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        try {
          const envelope = JSON.parse(
            message.value.toString()
          ) as KafkaEventEnvelope;
          await this.payments.handlePaymentConfirmed(
            envelope.tenant_id,
            envelope.payload as Record<string, unknown>
          );
        } catch (err) {
          this.logger.error("Error procesando cobrai.payment.confirmed", err);
        }
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
  }
}
