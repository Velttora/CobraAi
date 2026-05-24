import { Injectable } from "@nestjs/common";
import type { Debt, Debtor } from "@cobrai/db";
import { decimalToNumber } from "../common/utils/api.utils";

type ConditionValue =
  | string
  | number
  | boolean
  | string[]
  | { lt?: number; lte?: number; gt?: number; gte?: number; eq?: unknown };

@Injectable()
export class RuleEngineService {
  evaluateRules(
    debt: Debt,
    debtor: Debtor | null,
    condition: Record<string, unknown>
  ): { applied: boolean; reason?: string } {
    if (debt.status === "future" || debt.status === "upcoming") {
      return { applied: false, reason: "debt_not_yet_collectable" };
    }
    const applied = this.matchesCondition(debt, debtor, condition);
    return { applied, reason: applied ? undefined : "condition_not_met" };
  }

  matchesCondition(
    debt: Debt,
    debtor: Debtor | null,
    condition: Record<string, unknown>
  ): boolean {
    if (!condition || Object.keys(condition).length === 0) {
      return true;
    }

    for (const [field, expected] of Object.entries(condition)) {
      if (field.startsWith("__")) {
        continue;
      }
      const actual = this.resolveField(debt, debtor, field);
      if (!this.compareValue(actual, expected as ConditionValue)) {
        return false;
      }
    }
    return true;
  }

  private resolveField(
    debt: Debt,
    debtor: Debtor | null,
    field: string
  ): unknown {
    switch (field) {
      case "status":
        return debt.status;
      case "ai_score":
        return debt.aiScore;
      case "ai_segment":
        return debt.aiSegment;
      case "aging_bucket":
        return debt.agingBucket;
      case "amount_outstanding":
        return decimalToNumber(debt.amountOutstanding);
      case "whatsapp_opt_in":
        return debtor?.whatsappOptIn ?? false;
      case "aging_days": {
        const due = new Date(debt.dueDate);
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        due.setUTCHours(0, 0, 0, 0);
        return Math.max(
          0,
          Math.floor((today.getTime() - due.getTime()) / 86400000)
        );
      }
      default:
        return undefined;
    }
  }

  private compareValue(actual: unknown, expected: ConditionValue): boolean {
    if (Array.isArray(expected)) {
      return expected.includes(String(actual));
    }

    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const num = Number(actual);
      if (expected.lt !== undefined && !(num < expected.lt)) return false;
      if (expected.lte !== undefined && !(num <= expected.lte)) return false;
      if (expected.gt !== undefined && !(num > expected.gt)) return false;
      if (expected.gte !== undefined && !(num >= expected.gte)) return false;
      if (expected.eq !== undefined && actual !== expected.eq) return false;
      return true;
    }

    return actual === expected;
  }
}

export function filterDebtsForContact<T extends { id: string }>(
  items: T[],
  alreadyQueued: Set<string>
): T[] {
  return items.filter((item) => !alreadyQueued.has(item.id));
}
