"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceAgentStubAdapter = void 0;
const node_crypto_1 = require("node:crypto");
const callStore = new Map();
/**
 * Stub local: encola llamadas sintéticas para desarrollo sin servicio de voz.
 */
class VoiceAgentStubAdapter {
    async initiateCall(input) {
        const call_id = (0, node_crypto_1.randomUUID)();
        callStore.set(call_id, {
            call_id,
            status: "queued"
        });
        void input;
        return { call_id, status: "queued" };
    }
    async getCallStatus(call_id) {
        const existing = callStore.get(call_id);
        if (existing) {
            return { ...existing, status: "completed", duration_seconds: 45 };
        }
        return {
            call_id,
            status: "failed",
            failure_reason: "call_not_found"
        };
    }
}
exports.VoiceAgentStubAdapter = VoiceAgentStubAdapter;
