import type {
  AIScoringPort,
  ContactChannel,
  ScoreDebtInput,
  ScoringResult
} from "@cobrai/ports";
import {
  bestChannelForScores,
  calculatePriorityScore,
  calculateRecoveryScore,
  deriveManagementSegment
} from "@cobrai/utils";

const MODEL_VERSION = "stub-portfolios-2.0";

/** Stub de scoring dual: recuperación + prioridad de gestión. */
export class StubAIScoringAdapter implements AIScoringPort {
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

    const segment = deriveManagementSegment({
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
      confidence: 0.8,
      model_version: MODEL_VERSION
    };
  }
}

export const AI_SCORING_PORT = Symbol("AI_SCORING_PORT");
