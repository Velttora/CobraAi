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
      clientId: this.config.get<string>("KAFKA_CLIENT_ID") ?? "service-workflows"
    });
    this.producer = kafka.producer();
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer?.disconnect();
  }

  /**
   * @param key Clave de partición opcional. Los eventos con la misma clave caen
   *   en la misma partición y se consumen en orden, sin concurrencia entre sí.
   *   Se usa `debtor_id` en eventos por deudor (p. ej. cobrai.debtor.contact_queue)
   *   para que el coordinador de contactos procese las deudas de un mismo deudor
   *   de forma secuencial y no dispare varios mensajes (p. ej. la bienvenida).
   */
  async publish<T>(
    eventType: string,
    tenantId: string,
    payload: T,
    key?: string
  ): Promise<void> {
    if (!this.producer) {
      this.logger.debug(`Kafka skip ${eventType}`, payload as object);
      return;
    }
    const envelope = createEventEnvelope({
      event_type: eventType,
      version: "1.0",
      tenant_id: tenantId,
      source: "service-workflows",
      payload
    });
    await this.producer.send({
      topic: eventType,
      messages: [
        { ...(key ? { key } : {}), value: JSON.stringify(envelope) }
      ]
    });
  }
}
