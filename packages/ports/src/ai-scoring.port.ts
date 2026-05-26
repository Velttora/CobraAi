import type { ContactChannel, RiskSegment } from "./types/risk-segment";

/**
 * Contrato con el servicio externo de scoring con IA.
 * Implementación real fuera de alcance MVP core; usar {@link AIScoringStubAdapter}.
 */
export interface AIScoringPort {
  scoreDebt(input: ScoreDebtInput): Promise<ScoringResult>;
}

export interface ScoreDebtInput {
  debt_id: string;
  tenant_id: string;
  features: DebtFeatures;
}

export interface DebtFeatures {
  aging_days: number;
  amount: number;
  amount_outstanding: number;
  has_whatsapp: boolean;
  has_phone: boolean;
  has_email: boolean;
  promises_broken_count: number;
  previous_contacts_count: number;
  days_since_last_contact?: number | null;
  max_amount_in_portfolio: number;
  debt_status?: string;
  industry_sector?: string;
}

export interface ScoringResult {
  /** Probabilidad de recuperación 0–100. */
  score: number;
  /** Prioridad de gestión hoy 0–100 (valor esperado). */
  priority_score: number;
  segment: RiskSegment;
  risk_level: RiskSegment;
  best_channel: ContactChannel;
  best_contact_time: { days: string[]; hours: string };
  /** Confianza del modelo 0–1. */
  confidence: number;
  model_version: string;
}
