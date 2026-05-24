"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIScoringStubAdapter = void 0;
exports.createStubScoringResult = createStubScoringResult;
exports.stubDebtId = stubDebtId;
const node_crypto_1 = require("node:crypto");
const STUB_MODEL_VERSION = "stub-1.0.0";
function deriveSegment(score) {
    if (score >= 80)
        return "critical";
    if (score >= 60)
        return "high";
    if (score >= 40)
        return "medium";
    if (score >= 20)
        return "low";
    return "minimal";
}
function pickChannel(features) {
    if (features.has_whatsapp)
        return "whatsapp";
    if (features.has_phone)
        return "voice";
    if (features.has_email)
        return "email";
    return "sms";
}
/**
 * Stub local: scoring determinístico a partir de features para flujos E2E sin IA.
 */
class AIScoringStubAdapter {
    async scoreDebt(input) {
        const { features } = input;
        const agingWeight = Math.min(features.aging_days / 120, 1) * 40;
        const amountWeight = Math.min(features.amount_outstanding / 10_000_000, 1) * 30;
        const promiseWeight = Math.min(features.promises_broken_count * 5, 15);
        const contactWeight = Math.min(features.previous_contacts_count * 2, 15);
        const score = Math.round(Math.min(100, agingWeight + amountWeight + promiseWeight + contactWeight));
        const segment = deriveSegment(score);
        return {
            score,
            segment,
            risk_level: segment,
            best_channel: pickChannel(features),
            best_contact_time: {
                days: ["mon", "tue", "wed", "thu", "fri"],
                hours: "09:00-18:00"
            },
            confidence: 0.75,
            model_version: STUB_MODEL_VERSION
        };
    }
}
exports.AIScoringStubAdapter = AIScoringStubAdapter;
function createStubScoringResult(overrides = {}) {
    return {
        score: 50,
        segment: "medium",
        risk_level: "medium",
        best_channel: "email",
        best_contact_time: { days: ["mon"], hours: "10:00-12:00" },
        confidence: 0.5,
        model_version: STUB_MODEL_VERSION,
        ...overrides
    };
}
function stubDebtId() {
    return (0, node_crypto_1.randomUUID)();
}
