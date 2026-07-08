import { Kafka, type KafkaConfig, type SASLOptions } from "kafkajs";

type PasswordSaslMechanism = "plain" | "scram-sha-256" | "scram-sha-512";
const PASSWORD_SASL_MECHANISMS: readonly PasswordSaslMechanism[] = [
  "plain",
  "scram-sha-256",
  "scram-sha-512"
];

function resolveSasl(): SASLOptions | undefined {
  const username = process.env.KAFKA_SASL_USERNAME?.trim();
  const password = process.env.KAFKA_SASL_PASSWORD?.trim();
  if (!username || !password) return undefined;

  const requested = process.env.KAFKA_SASL_MECHANISM?.trim().toLowerCase();
  const mechanism = PASSWORD_SASL_MECHANISMS.includes(requested as PasswordSaslMechanism)
    ? (requested as PasswordSaslMechanism)
    : "scram-sha-256";

  return { mechanism, username, password };
}

export function createKafkaClient(config?: Partial<KafkaConfig>): Kafka {
  const brokers = (process.env.KAFKA_BROKERS ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
  if (brokers.length === 0) {
    throw new Error("KAFKA_BROKERS is required to create a Kafka client");
  }

  const sasl = resolveSasl();
  return new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID ?? "cobrai",
    brokers,
    ssl: sasl !== undefined || process.env.KAFKA_SSL === "true",
    ...(sasl ? { sasl } : {}),
    ...config
  });
}
