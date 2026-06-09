import { vi, describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./cobrai-system.prompt";

const baseContext = {
  debtorName: "Juan Pérez",
  companyName: "CobraAI Demo",
  amount: "500000",
  currency: "COP",
  dueDate: "01/06/2026",
  paymentLink: "http://localhost:3001/pay/debt1",
  debtStatus: "active"
};

const baseHistory = {
  previousContactsCount: 3,
  brokenPromisesCount: 1,
  lastOutcome: "no_answer",
  lastContactDaysAgo: 5,
  preferredChannel: "whatsapp",
  callSummary: null,
  hasPromisePending: false,
  promisedDate: null
};

describe("buildSystemPrompt — DebtorHistory living summary extension", () => {
  it("Test 1: livingSummary presente → prompt contiene 'Perfil del deudor' y el texto del summary", () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      debtorHistory: {
        ...baseHistory,
        livingSummary: "Deudor con historial de promesas incumplidas.",
        overallSentiment: null,
        paymentBehavior: null
      }
    });

    expect(prompt).toContain("Perfil del deudor");
    expect(prompt).toContain("Deudor con historial de promesas incumplidas.");
  });

  it("Test 2: livingSummary null/undefined → prompt NO contiene 'Perfil del deudor' (backward-compatible)", () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      debtorHistory: {
        ...baseHistory,
        livingSummary: null,
        overallSentiment: null,
        paymentBehavior: null
      }
    });

    expect(prompt).not.toContain("Perfil del deudor");
  });

  it("Test 3: overallSentiment presente con previousContactsCount > 0 → prompt refleja línea de sentimiento", () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      debtorHistory: {
        ...baseHistory,
        previousContactsCount: 2,
        livingSummary: null,
        overallSentiment: "negativo",
        paymentBehavior: "evasivo"
      }
    });

    expect(prompt).toContain("negativo");
  });
});
