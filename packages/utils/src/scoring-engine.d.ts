export type ManagementSegment = "critical" | "high" | "medium" | "low" | "minimal";
export type RecoveryScoreInput = {
    aging_days: number;
    amount_outstanding: number;
    has_whatsapp: boolean;
    has_phone: boolean;
    has_email: boolean;
    promises_broken_count: number;
    previous_contacts_count: number;
};
export type ManagementSegmentInput = {
    ai_score: number;
    priority_score: number;
    aging_days: number;
    amount_outstanding: number;
    debt_status?: string;
    /** COP; deudas por encima cuentan como monto alto para escalamiento legal. */
    high_amount_threshold?: number;
};
/** Probabilidad de recuperación: más mora → menor score. */
export declare function agingRecoveryScore(agingDays: number): number;
/** Sin historial = neutro; muchos intentos sin pago reducen probabilidad. */
export declare function responseHistoryScore(previousContacts: number): number;
export declare function promisesBrokenScore(promisesBroken: number): number;
export declare function channelAvailabilityScore(input: {
    has_whatsapp: boolean;
    has_phone: boolean;
    has_email: boolean;
}): number;
/** Montos menores suelen liquidarse con más facilidad (componente de recuperación). */
export declare function amountNormalizedRecoveryScore(amountOutstanding: number): number;
/** ai_score — probabilidad de recuperación (0–100). */
export declare function calculateRecoveryScore(input: RecoveryScoreInput): number;
/**
 * priority_score — prioridad de gestión hoy (valor esperado × urgencia de contacto).
 * max_amount_in_portfolio debe ser > 0 (usar 1 si el portafolio está vacío).
 */
export declare function calculatePriorityScore(aiScore: number, amountOutstanding: number, daysSinceLastContact: number | null, maxAmountInPortfolio: number): number;
export declare function daysSinceLastContact(lastContactAt: Date | null, today?: Date): number | null;
/**
 * Segmento operativo (quién gestionar y cómo), no solo riesgo crediticio.
 */
export declare function deriveManagementSegment(input: ManagementSegmentInput): ManagementSegment;
export declare function bestChannelForScores(recoveryScore: number, priorityScore: number, hasWhatsapp: boolean): "whatsapp" | "voice" | "email";
export declare function planOperationalScores(input: {
    recovery_score: number;
    amount_outstanding: number;
    days_since_last_contact: number | null;
    max_amount_in_portfolio: number;
    aging_days: number;
    debt_status?: string;
    has_whatsapp: boolean;
}): {
    priority_score: number;
    segment: ManagementSegment;
    best_channel: "whatsapp" | "voice" | "email";
};
//# sourceMappingURL=scoring-engine.d.ts.map