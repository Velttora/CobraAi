"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEventEnvelope = createEventEnvelope;
const node_crypto_1 = require("node:crypto");
function createEventEnvelope(input) {
    return {
        event_id: input.event_id ?? (0, node_crypto_1.randomUUID)(),
        timestamp: input.timestamp ?? new Date().toISOString(),
        event_type: input.event_type,
        version: input.version,
        tenant_id: input.tenant_id,
        source: input.source,
        payload: input.payload,
        metadata: input.metadata
    };
}
