import { Kafka, type KafkaConfig, type SASLOptions } from "kafkajs";

export function createKafkaClient(config?: Partial<KafkaConfig>): Kafka {
  const brokers = (process.env.KAFKA_BROKERS ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
  if (brokers.length === 0) {
    throw new Error("KAFKA_BROKERS is required to create a Kafka client");
  }

  // Managed brokers (Confluent, Aiven, …) require SASL over TLS. Enabled only
  // when credentials are present, so local plaintext brokers keep working.
  const username = process.env.KAFKA_SASL_USERNAME?.trim();
  const password = process.env.KAFKA_SASL_PASSWORD?.trim();
  const sasl: SASLOptions | undefined =
    username && password
      ? {
          mechanism: (process.env.KAFKA_SASL_MECHANISM ?? "plain") as "plain",
          username,
          password
        }
      : undefined;

  return new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID ?? "cobrai",
    brokers,
    ...(sasl ? { ssl: true, sasl } : {}),
    ...config
  });
}
