import { startOfZonedDayUtc } from "./dates";

export type ManagementSegment =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "minimal";

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Probabilidad de recuperación: más mora → menor score. */
export function agingRecoveryScore(agingDays: number): number {
  return clamp(100 - agingDays * 0.5, 0, 100);
}

/** Sin historial = neutro; muchos intentos sin pago reducen probabilidad. */
export function responseHistoryScore(previousContacts: number): number {
  if (previousContacts <= 0) return 55;
  return clamp(100 - previousContacts * 12, 15, 85);
}

export function promisesBrokenScore(promisesBroken: number): number {
  return clamp(100 - promisesBroken * 25, 0, 100);
}

export function channelAvailabilityScore(input: {
  has_whatsapp: boolean;
  has_phone: boolean;
  has_email: boolean;
}): number {
  let score = 0;
  if (input.has_whatsapp) score += 40;
  if (input.has_phone) score += 35;
  if (input.has_email) score += 25;
  return Math.min(100, score);
}

/** Montos menores suelen liquidarse con más facilidad (componente de recuperación). */
export function amountNormalizedRecoveryScore(amountOutstanding: number): number {
  if (amountOutstanding <= 100_000) return 90;
  if (amountOutstanding <= 500_000) return 72;
  if (amountOutstanding <= 2_000_000) return 52;
  if (amountOutstanding <= 10_000_000) return 38;
  return 28;
}

/** ai_score — probabilidad de recuperación (0–100). */
export function calculateRecoveryScore(input: RecoveryScoreInput): number {
  const score =
    agingRecoveryScore(input.aging_days) * 0.3 +
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
export function calculatePriorityScore(
  aiScore: number,
  amountOutstanding: number,
  daysSinceLastContact: number | null,
  maxAmountInPortfolio: number
): number {
  const maxAmount = Math.max(maxAmountInPortfolio, 1);
  const evRatio = (aiScore / 100) * (amountOutstanding / maxAmount);
  const days = daysSinceLastContact ?? 999;
  const recency = Math.min(days / 30, 1);
  const raw = evRatio * (0.65 + 0.35 * recency);
  return Math.round(clamp(raw * 100, 0, 100));
}

export function daysSinceLastContact(lastContactAt: Date | null, today = new Date()): number | null {
  if (!lastContactAt) return null;
  const start = startOfZonedDayUtc(today);
  const last = startOfZonedDayUtc(lastContactAt);
  return Math.max(0, Math.floor((start.getTime() - last.getTime()) / 86_400_000));
}

/**
 * Segmento operativo (quién gestionar y cómo), no solo riesgo crediticio.
 */
export function deriveManagementSegment(
  input: ManagementSegmentInput
): ManagementSegment {
  if (input.debt_status === "promised") return "minimal";

  const highAmountThreshold = input.high_amount_threshold ?? 500_000;
  const highAmount = input.amount_outstanding >= highAmountThreshold;

  if (input.aging_days > 180 || (input.ai_score < 20 && highAmount)) {
    return "critical";
  }
  if (input.priority_score > 70) return "high";
  if (input.priority_score >= 40) return "medium";
  if (input.priority_score < 40 && input.ai_score > 70) return "low";
  return "low";
}

export type SuggestedContactChannel = "whatsapp" | "voice" | "email";

export type ChannelAvailability = {
  /** Opt-in de WhatsApp del deudor. */
  has_whatsapp: boolean;
  has_phone: boolean;
  has_email: boolean;
};

/** Indica si tenemos datos para contactar por ese canal. */
export function isContactChannelAvailable(
  channel: SuggestedContactChannel,
  availability: ChannelAvailability
): boolean {
  switch (channel) {
    case "whatsapp":
      return availability.has_whatsapp && availability.has_phone;
    case "voice":
      return availability.has_phone;
    case "email":
      return availability.has_email;
    default:
      return false;
  }
}

/** Orden de preferencia según scores (sin mirar disponibilidad). */
export function rankPreferredChannels(
  recoveryScore: number,
  priorityScore: number,
  whatsappOptIn: boolean
): SuggestedContactChannel[] {
  const ranked: SuggestedContactChannel[] = [];
  if (whatsappOptIn && priorityScore >= 40) ranked.push("whatsapp");
  if (priorityScore > 70 || recoveryScore < 40) ranked.push("voice");
  ranked.push("email");
  ranked.push("voice"); // fallback: si no hay email, voice siempre está disponible con teléfono
  return [...new Set(ranked)];
}

/**
 * Primer canal recomendado que el deudor puede usar; null si no hay ningún dato de contacto.
 */
export function bestChannelForScores(
  recoveryScore: number,
  priorityScore: number,
  availability: ChannelAvailability
): SuggestedContactChannel | null {
  const ranked = rankPreferredChannels(
    recoveryScore,
    priorityScore,
    availability.has_whatsapp
  );
  for (const channel of ranked) {
    if (isContactChannelAvailable(channel, availability)) {
      return channel;
    }
  }
  return null;
}

export function planOperationalScores(input: {
  recovery_score: number;
  amount_outstanding: number;
  days_since_last_contact: number | null;
  max_amount_in_portfolio: number;
  aging_days: number;
  debt_status?: string;
  has_whatsapp: boolean;
  has_phone: boolean;
  has_email: boolean;
}): {
  priority_score: number;
  segment: ManagementSegment;
  best_channel: SuggestedContactChannel | null;
} {
  const priority_score = calculatePriorityScore(
    input.recovery_score,
    input.amount_outstanding,
    input.days_since_last_contact,
    input.max_amount_in_portfolio
  );
  const segment = deriveManagementSegment({
    ai_score: input.recovery_score,
    priority_score,
    aging_days: input.aging_days,
    amount_outstanding: input.amount_outstanding,
    debt_status: input.debt_status
  });
  const best_channel = bestChannelForScores(input.recovery_score, priority_score, {
    has_whatsapp: input.has_whatsapp,
    has_phone: input.has_phone,
    has_email: input.has_email
  });
  return { priority_score, segment, best_channel };
}
