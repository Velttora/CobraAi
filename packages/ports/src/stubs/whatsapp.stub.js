"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppStubAdapter = void 0;
const node_crypto_1 = require("node:crypto");
const optedInPhones = new Set();
/**
 * Stub local: simula envío y opt-in de WhatsApp para flujos E2E.
 */
class WhatsAppStubAdapter {
    async sendTemplate(input) {
        void input;
        return {
            message_id: (0, node_crypto_1.randomUUID)(),
            status: "sent"
        };
    }
    async isOptedIn(phone, tenant_id) {
        void tenant_id;
        return optedInPhones.has(phone) || phone.endsWith("0");
    }
    /** Helper de pruebas: registrar opt-in sintético. */
    registerOptIn(phone) {
        optedInPhones.add(phone);
    }
}
exports.WhatsAppStubAdapter = WhatsAppStubAdapter;
