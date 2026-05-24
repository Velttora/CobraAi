import { randomUUID } from "node:crypto";

/**
 * Envelope estándar de eventos Kafka (CobraAI).
 */
export interface KafkaEventEnvelope<TPayload = unknown> {
  event_id: string;
  event_type: string;
  version: string;
  tenant_id: string;
  timestamp: string;
  source: string;
  payload: TPayload;
  metadata?: Record<string, unknown>;
}

export function createEventEnvelope<TPayload>(
  input: Omit<KafkaEventEnvelope<TPayload>, "event_id" | "timestamp"> & {
    event_id?: string;
    timestamp?: string;
  }
): KafkaEventEnvelope<TPayload> {
  return {
    event_id: input.event_id ?? randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    event_type: input.event_type,
    version: input.version,
    tenant_id: input.tenant_id,
    source: input.source,
    payload: input.payload,
    metadata: input.metadata
  };
}
