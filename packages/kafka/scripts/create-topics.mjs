#!/usr/bin/env node
import { Kafka } from "kafkajs";

// Debe reflejar todos los event_type usados en `this.kafka.publish(...)` en los
// microservicios. Si agregas un evento nuevo, agrégalo aquí también.
const TOPICS = [
  "cobrai.contact.failed.no_response",
  "cobrai.contact.completed",
  "cobrai.payment_plan.created",
  "cobrai.debt.disputed",
  "cobrai.voice.call_requested",
  "cobrai.whatsapp.send_requested",
  "cobrai.voice.call_completed",
  "cobrai.debt.promise_registered",
  "cobrai.payment_link.delivery_failed",
  "cobrai.escalation.requested",
  "cobrai.whatsapp.message_received",
  "cobrai.email.message_received",
  "cobrai.payment.confirmed",
  "cobrai.debt.created",
  "cobrai.debt.segmented",
  "cobrai.debt.updated",
  "cobrai.portfolio.imported",
  "cobrai.debtor.contact_queue",
  "cobrai.debt.escalated",
  "cobrai.debt.status_changed"
];

const brokers = (process.env.KAFKA_BROKERS ?? "")
  .split(",")
  .map((b) => b.trim())
  .filter(Boolean);

if (brokers.length === 0) {
  console.error(
    "KAFKA_BROKERS no está definido. Exporta las credenciales del cluster de destino antes de correr este script."
  );
  process.exit(1);
}

const username = process.env.KAFKA_SASL_USERNAME?.trim();
const password = process.env.KAFKA_SASL_PASSWORD?.trim();
const sasl =
  username && password
    ? {
        mechanism: process.env.KAFKA_SASL_MECHANISM?.trim() || "scram-sha-256",
        username,
        password
      }
    : undefined;

const kafka = new Kafka({
  clientId: "cobrai-topic-provisioner",
  brokers,
  ssl: Boolean(sasl) || process.env.KAFKA_SSL === "true",
  ...(sasl ? { sasl } : {})
});

const admin = kafka.admin();

async function main() {
  await admin.connect();
  const existing = await admin.listTopics();
  const missing = TOPICS.filter((topic) => !existing.includes(topic));

  if (missing.length === 0) {
    console.log(`Los ${TOPICS.length} topics de eventos ya existen en el cluster.`);
    return;
  }

  console.log(`Creando ${missing.length} topics faltantes:\n  ${missing.join("\n  ")}`);
  await admin.createTopics({
    topics: missing.map((topic) => ({
      topic,
      numPartitions: -1,
      replicationFactor: -1
    }))
  });
  console.log("Listo.");
}

main()
  .catch((err) => {
    console.error("Error aprovisionando topics:", err);
    console.error(
      "Si el cluster no soporta numPartitions/replicationFactor=-1 (usar default), créalos manualmente desde la consola de Upstash."
    );
    process.exitCode = 1;
  })
  .finally(() => admin.disconnect());
