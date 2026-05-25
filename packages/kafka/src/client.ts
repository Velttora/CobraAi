import { Kafka, type KafkaConfig } from "kafkajs";

export function createKafkaClient(config?: Partial<KafkaConfig>): Kafka {
  const brokers = (process.env.KAFKA_BROKERS ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
  if (brokers.length === 0) {
    throw new Error("KAFKA_BROKERS is required to create a Kafka client");
  }
  return new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID ?? "cobrai",
    brokers,
    ...config
  });
}
