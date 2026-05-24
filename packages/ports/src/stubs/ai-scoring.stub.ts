import { randomUUID } from "node:crypto";
import type {
  AIScoringPort,
  ScoreDebtInput,
  ScoringResult
} from "../ai-scoring.port";
import type { ContactChannel, RiskSegment } from "../types/risk-segment";

const STUB_MODEL_VERSION = "stub-1.0.0";

function deriveSegment(score: number): RiskSegment {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "minimal";
}

function pickChannel(features: ScoreDebtInput["features"]): ContactChannel {
  if (features.has_whatsapp) return "whatsapp";
  if (features.has_phone) return "voice";
  if (features.has_email) return "email";
  return "sms";
}

/**
 * Stub local: scoring determinístico a partir de features para flujos E2E sin IA.
 */
export class AIScoringStubAdapter implements AIScoringPort {
  async scoreDebt(input: ScoreDebtInput): Promise<ScoringResult> {
    const { features } = input;
    const agingWeight = Math.min(features.aging_days / 120, 1) * 40;
    const amountWeight = Math.min(features.amount_outstanding / 10_000_000, 1) * 30;
    const promiseWeight = Math.min(features.promises_broken_count * 5, 15);
    const contactWeight = Math.min(features.previous_contacts_count * 2, 15);
    const score = Math.round(
      Math.min(100, agingWeight + amountWeight + promiseWeight + contactWeight)
    );
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

export function createStubScoringResult(
  overrides: Partial<ScoringResult> = {}
): ScoringResult {
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

export function stubDebtId(): string {
  return randomUUID();
}
