import { randomUUID } from "node:crypto";
import {
  bestChannelForScores,
  calculatePriorityScore,
  calculateRecoveryScore,
  deriveManagementSegment
} from "@cobrai/utils";
import type {
  AIScoringPort,
  ScoreDebtInput,
  ScoringResult
} from "../ai-scoring.port";
import type { ContactChannel, RiskSegment } from "../types/risk-segment";

const STUB_MODEL_VERSION = "stub-1.0.0";

/**
 * Stub local: scoring determinístico (recuperación + prioridad) para E2E.
 */
export class AIScoringStubAdapter implements AIScoringPort {
  async scoreDebt(input: ScoreDebtInput): Promise<ScoringResult> {
    const { features } = input;
    const score = calculateRecoveryScore({
      aging_days: features.aging_days,
      amount_outstanding: features.amount_outstanding,
      has_whatsapp: features.has_whatsapp,
      has_phone: features.has_phone,
      has_email: features.has_email,
      promises_broken_count: features.promises_broken_count,
      previous_contacts_count: features.previous_contacts_count
    });

    const priority_score = calculatePriorityScore(
      score,
      features.amount_outstanding,
      features.days_since_last_contact ?? null,
      Math.max(features.max_amount_in_portfolio, 1)
    );

    const segment: RiskSegment = deriveManagementSegment({
      ai_score: score,
      priority_score,
      aging_days: features.aging_days,
      amount_outstanding: features.amount_outstanding,
      debt_status: features.debt_status
    });

    const best_channel: ContactChannel = bestChannelForScores(
      score,
      priority_score,
      features.has_whatsapp
    );

    return {
      score,
      priority_score,
      segment,
      risk_level: segment,
      best_channel,
      best_contact_time: {
        days: ["mon", "tue", "wed", "thu", "fri"],
        hours: "09:00-18:00"
      },
      confidence: 0.75,
      model_version: STUB_MODEL_VERSION
    };
  }
}

export function createStubScoringResult(
  overrides: Partial<ScoringResult> = {}
): ScoringResult {
  return {
    score: 50,
    priority_score: 50,
    segment: "medium",
    risk_level: "medium",
    best_channel: "email",
    best_contact_time: { days: ["mon"], hours: "10:00-12:00" },
    confidence: 0.5,
    model_version: STUB_MODEL_VERSION,
    ...overrides
  };
}

export function stubDebtId(): string {
  return randomUUID();
}
