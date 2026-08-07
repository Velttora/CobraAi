import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createKafkaClient, type KafkaEventEnvelope } from "@cobrai/kafka";
import { WorkflowsService } from "../workflows/workflows.service";

const CONSUMED_TOPICS = [
  "cobrai.debt.created",
  "cobrai.debt.segmented",
  "cobrai.contact.effective",
  "cobrai.contact.no_response",
  // `payment.applied`, no `payment.confirmed`: lo publica service-portfolios
  // después de escribir saldo y estado, así que las condiciones de las reglas
  // se evalúan sobre la deuda ya actualizada.
  "cobrai.payment.applied",
  "cobrai.promise.kept"
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

    // Subscribe per topic rather than letting one failure abort the loop. A
    // topic that does not exist on the broker yet (UNKNOWN_TOPIC_OR_PARTITION)
    // used to reject onModuleInit, fail the Nest boot and crash-loop the
    // machine — so a single missing topic took down the whole workflow engine,
    // including its HTTP surface, over one event flow that would not have
    // worked anyway. Degrade instead: consume what exists, and say loudly what
    // is missing so it gets provisioned.
    const missing: string[] = [];
    for (const topic of CONSUMED_TOPICS) {
      try {
        await this.consumer.subscribe({ topic, fromBeginning: false });
      } catch (err) {
        missing.push(topic);
        this.logger.error(
          `No se pudo suscribir a "${topic}": ${(err as Error).message}. ` +
            `Ese flujo de eventos queda inactivo; el resto del servicio sigue operando.`
        );
      }
    }

    if (missing.length === CONSUMED_TOPICS.length) {
      this.logger.error(
        `Ningún topic disponible en el broker (${missing.length}). El consumer queda inerte — ` +
          `revisa el aprovisionamiento con "pnpm kafka:create-topics".`
      );
      return;
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
      case "cobrai.contact.effective":
        await this.workflows.handleContactEffective(tenantId, payload);
        break;
      case "cobrai.contact.no_response":
        await this.workflows.handleContactNoResponse(tenantId, payload);
        break;
      case "cobrai.payment.applied":
        await this.workflows.handlePaymentApplied(tenantId, payload);
        break;
      case "cobrai.promise.kept":
        await this.workflows.handlePromiseKept(tenantId, payload);
        break;
      default:
        break;
    }
  }
}
