"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createKafkaClient = createKafkaClient;
const kafkajs_1 = require("kafkajs");
function createKafkaClient(config) {
    const brokers = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
    return new kafkajs_1.Kafka({
        clientId: process.env.KAFKA_CLIENT_ID ?? "cobrai",
        brokers,
        ...config
    });
}
