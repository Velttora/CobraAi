import type { ContactChannel } from "@cobrai/db";

export type ContactCheckReason =
  | "no_consent"
  | "opt_out_global"
  | "opt_out_channel"
  | "outside_hours"
  | "frequency_limit"
  | "awaiting_response"
  | "retry_cooldown"
  | "max_attempts_reached"
  | "whatsapp_not_opted_in"
  | "debtor_not_found";

export interface ContactCheckResult {
  allowed: boolean;
  reason?: ContactCheckReason;
  next_allowed_at?: Date;
}

export interface ContactCheckInput {
  tenantId: string;
  debtorId: string;
  channel: ContactChannel;
  country?: string;
  at?: Date;
  userId?: string;
}

export type CountryHours = {
  startHour: number;
  endHour: number;
  days: number[];
};

export type CountryFrequencyRule = {
  /** Tope anti-spam del mismo día, ortogonal al ciclo de reintentos (ver ContactRetryPolicy). */
  maxPerDayPerChannel?: number;
};

export type CountryRuleSet = {
  code: string;
  /** Zona horaria IANA para evaluar ventanas de contacto en hora local 24h. */
  timezone: string;
  hours: CountryHours;
  frequency: CountryFrequencyRule;
  requireCreditorIdentification: boolean;
  requireExplicitConsent: boolean;
};

export type ContactRetryEscalation = "switch_channel" | "same_channel";

/** Destino final cuando se agotan los intentos sin respuesta. */
export type ContactEscalationTarget = "legal_risk" | "human";

export type ContactRetryPolicy = {
  /** Horas de espera tras un envío antes de considerarlo "sin contacto". */
  windowHours: number;
  /** Intentos totales por ciclo de contacto antes de escalar. */
  maxAttempts: number;
  /** Canal a usar en cada reintento (switch_channel avanza por el waterfall; same_channel repite). */
  escalation: ContactRetryEscalation;
  /** Qué hacer al agotar maxAttempts sin respuesta: mover la deuda a riesgo legal o escalar a un agente humano sin tocar su estado. */
  escalateTo: ContactEscalationTarget;
};

export function countryFromAddress(address: unknown): string {
  if (!address || typeof address !== "object") return "CO";
  const country = (address as { country?: string }).country;
  return country?.toUpperCase().slice(0, 2) ?? "CO";
}
