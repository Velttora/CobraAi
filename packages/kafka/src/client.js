"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createKafkaClient = createKafkaClient;
const kafkajs_1 = require("kafkajs");
function createKafkaClient(config) {
    const brokers = (process.env.KAFKA_BROKERS ?? "")
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean);
    if (brokers.length === 0) {
        throw new Error("KAFKA_BROKERS is required to create a Kafka client");
    }
    const username = process.env.KAFKA_SASL_USERNAME?.trim();
    const password = process.env.KAFKA_SASL_PASSWORD?.trim();
    const sasl = username && password
        ? {
            mechanism: (process.env.KAFKA_SASL_MECHANISM ?? "plain"),
            username,
            password
        }
        : undefined;
    return new kafkajs_1.Kafka({
        clientId: process.env.KAFKA_CLIENT_ID ?? "cobrai",
        brokers,
        ...(sasl ? { ssl: true, sasl } : {}),
        ...config
    });
}
