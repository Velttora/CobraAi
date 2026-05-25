import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createEventEnvelope, createKafkaClient } from "@cobrai/kafka";

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private producer: Awaited<
    ReturnType<ReturnType<typeof createKafkaClient>["producer"]>
  > | null = null;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.enabled = Boolean(this.config.get<string>("KAFKA_BROKERS")?.trim());
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn("Kafka deshabilitado (KAFKA_BROKERS no configurado)");
      return;
    }
    const kafka = createKafkaClient({
      clientId: this.config.get<string>("KAFKA_CLIENT_ID") ?? "service-notifications"
    });
    this.producer = kafka.producer();
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer?.disconnect();
  }

  async publish<T>(
    eventType: string,
    tenantId: string,
    payload: T
  ): Promise<void> {
    if (!this.producer) {
      this.logger.debug(`Kafka skip ${eventType}`, payload as object);
      return;
    }
    const envelope = createEventEnvelope({
      event_type: eventType,
      version: "1.0",
      tenant_id: tenantId,
      source: "service-notifications",
      payload
    });
    await this.producer.send({
      topic: eventType,
      messages: [{ value: JSON.stringify(envelope) }]
    });
  }
}
