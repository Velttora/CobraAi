"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agingRecoveryScore = agingRecoveryScore;
exports.responseHistoryScore = responseHistoryScore;
exports.promisesBrokenScore = promisesBrokenScore;
exports.channelAvailabilityScore = channelAvailabilityScore;
exports.amountNormalizedRecoveryScore = amountNormalizedRecoveryScore;
exports.calculateRecoveryScore = calculateRecoveryScore;
exports.calculatePriorityScore = calculatePriorityScore;
exports.daysSinceLastContact = daysSinceLastContact;
exports.deriveManagementSegment = deriveManagementSegment;
exports.bestChannelForScores = bestChannelForScores;
exports.planOperationalScores = planOperationalScores;
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
/** Probabilidad de recuperación: más mora → menor score. */
function agingRecoveryScore(agingDays) {
    return clamp(100 - agingDays * 0.5, 0, 100);
}
/** Sin historial = neutro; muchos intentos sin pago reducen probabilidad. */
function responseHistoryScore(previousContacts) {
    if (previousContacts <= 0)
        return 55;
    return clamp(100 - previousContacts * 12, 15, 85);
}
function promisesBrokenScore(promisesBroken) {
    return clamp(100 - promisesBroken * 25, 0, 100);
}
function channelAvailabilityScore(input) {
    let score = 0;
    if (input.has_whatsapp)
        score += 40;
    if (input.has_phone)
        score += 35;
    if (input.has_email)
        score += 25;
    return Math.min(100, score);
}
/** Montos menores suelen liquidarse con más facilidad (componente de recuperación). */
function amountNormalizedRecoveryScore(amountOutstanding) {
    if (amountOutstanding <= 100_000)
        return 90;
    if (amountOutstanding <= 500_000)
        return 72;
    if (amountOutstanding <= 2_000_000)
        return 52;
    if (amountOutstanding <= 10_000_000)
        return 38;
    return 28;
}
/** ai_score — probabilidad de recuperación (0–100). */
function calculateRecoveryScore(input) {
    const score = agingRecoveryScore(input.aging_days) * 0.3 +
        responseHistoryScore(input.previous_contacts_count) * 0.25 +
        promisesBrokenScore(input.promises_broken_count) * 0.2 +
        channelAvailabilityScore(input) * 0.15 +
        amountNormalizedRecoveryScore(input.amount_outstanding) * 0.1;
    return Math.round(clamp(score, 0, 100));
}
/**
 * priority_score — prioridad de gestión hoy (valor esperado × urgencia de contacto).
 * max_amount_in_portfolio debe ser > 0 (usar 1 si el portafolio está vacío).
 */
function calculatePriorityScore(aiScore, amountOutstanding, daysSinceLastContact, maxAmountInPortfolio) {
    const maxAmount = Math.max(maxAmountInPortfolio, 1);
    const evRatio = (aiScore / 100) * (amountOutstanding / maxAmount);
    const days = daysSinceLastContact ?? 999;
    const recency = Math.min(days / 30, 1);
    const raw = evRatio * (0.65 + 0.35 * recency);
    return Math.round(clamp(raw * 100, 0, 100));
}
function daysSinceLastContact(lastContactAt, today = new Date()) {
    if (!lastContactAt)
        return null;
    const start = new Date(today);
    start.setUTCHours(0, 0, 0, 0);
    const last = new Date(lastContactAt);
    last.setUTCHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((start.getTime() - last.getTime()) / 86_400_000));
}
/**
 * Segmento operativo (quién gestionar y cómo), no solo riesgo crediticio.
 */
function deriveManagementSegment(input) {
    if (input.debt_status === "promised")
        return "minimal";
    const highAmountThreshold = input.high_amount_threshold ?? 500_000;
    const highAmount = input.amount_outstanding >= highAmountThreshold;
    if (input.aging_days > 180 || (input.ai_score < 20 && highAmount)) {
        return "critical";
    }
    if (input.priority_score > 70)
        return "high";
    if (input.priority_score >= 40)
        return "medium";
    if (input.priority_score < 40 && input.ai_score > 70)
        return "low";
    return "low";
}
function bestChannelForScores(recoveryScore, priorityScore, hasWhatsapp) {
    if (hasWhatsapp && priorityScore >= 40)
        return "whatsapp";
    if (priorityScore > 70 || recoveryScore < 40)
        return "voice";
    return "email";
}
function planOperationalScores(input) {
    const priority_score = calculatePriorityScore(input.recovery_score, input.amount_outstanding, input.days_since_last_contact, input.max_amount_in_portfolio);
    const segment = deriveManagementSegment({
        ai_score: input.recovery_score,
        priority_score,
        aging_days: input.aging_days,
        amount_outstanding: input.amount_outstanding,
        debt_status: input.debt_status
    });
    const best_channel = bestChannelForScores(input.recovery_score, priority_score, input.has_whatsapp);
    return { priority_score, segment, best_channel };
}
