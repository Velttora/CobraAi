import { describe, it, expect } from "vitest";
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

describe("buildSystemPrompt — multi-cuenta", () => {
  it("varias cuentas → lista todas con total, en vez de una sola deuda", () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      accounts: [
        { ref: "7", amountStr: "COP 7.000.000", dueDate: "02/06/2026", status: "contacted" },
        { ref: "6", amountStr: "COP 6.000.000", dueDate: "28/05/2026", status: "contacted" },
        { ref: "2", amountStr: "COP 20.000", dueDate: "23/06/2026", status: "active" }
      ],
      totalOutstandingStr: "COP 13.020.000"
    });

    expect(prompt).toContain("Cuentas pendientes: 3");
    expect(prompt).toContain("COP 13.020.000");
    expect(prompt).toContain("Cuenta 7:");
    expect(prompt).toContain("Cuenta 6:");
    expect(prompt).toContain("Cuenta 2:");
    // No debe usar el formato de deuda única cuando hay varias.
    expect(prompt).not.toContain("Saldo pendiente:");
  });

  it("una sola cuenta → formato de deuda única (backward-compatible)", () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      accounts: [
        { ref: "7", amountStr: "COP 7.000.000", dueDate: "02/06/2026", status: "contacted" }
      ],
      totalOutstandingStr: "COP 7.000.000"
    });

    expect(prompt).toContain("Saldo pendiente:");
    expect(prompt).not.toContain("Cuentas pendientes:");
  });
});
