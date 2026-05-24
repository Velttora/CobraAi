import { Kafka, type KafkaConfig } from "kafkajs";

export function createKafkaClient(config?: Partial<KafkaConfig>): Kafka {
  const brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
  return new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID ?? "cobrai",
    brokers,
    ...config
  });
}
