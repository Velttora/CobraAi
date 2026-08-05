import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CommitmentItem } from "../../hooks/use-negotiations";
import { NegotiationCard } from "./NegotiationCard";

function makeItem(overrides: Partial<CommitmentItem> = {}): CommitmentItem {
  return {
    id: "promise:1",
    source: "direct_promise",
    status: "agreed",
    commitment_state: "pending",
    debt_id: "debt1",
    debtor_id: "debtor1",
    debtor_name: "Juan Pérez",
    debt_external_ref: "FAC-001",
    debt_amount_outstanding: 1_200_000,
    debt_due_date: "2026-01-15T00:00:00.000Z",
    aging_bucket: "d31_60",
    currency: "COP",
    ai_segment: "high",
    portfolio_id: "port1",
    portfolio_name: "Cartera Enero",
    offer_settlement_amount: 450_000,
    offer_installments: 1,
    amount_paid: 0,
    installments_paid: 0,
    due_date: "2026-03-20T00:00:00.000Z",
    days_overdue: -10,
    channel: "whatsapp",
    notes: null,
    conversation: null,
    conversation_id: null,
    agreed_at: "2026-03-05T00:00:00.000Z",
    updated_at: "2026-03-05T00:00:00.000Z",
    plan_id: null,
    has_detail: false,
    ...overrides
  };
}

describe("NegotiationCard", () => {
  it("muestra el compromiso, el deudor y la cuenta", () => {
    render(<NegotiationCard commitment={makeItem()} />);

    expect(screen.getByText("Promesa · COP 450.000")).toBeInTheDocument();
    expect(screen.getByText(/Juan Pérez/)).toBeInTheDocument();
    expect(screen.getByText(/FAC-001/)).toBeInTheDocument();
    expect(screen.getByText("Vigente")).toBeInTheDocument();
  });

  it("pone al frente cuánto lleva vencido el compromiso", () => {
    render(
      <NegotiationCard
        commitment={makeItem({ commitment_state: "overdue", days_overdue: 12 })}
      />
    );

    expect(screen.getByText(/Venció hace 12 días/)).toBeInTheDocument();
    expect(screen.getByText("Vencida")).toBeInTheDocument();
  });

  it("muestra el avance de un plan en cuotas", () => {
    render(
      <NegotiationCard
        commitment={makeItem({
          id: "plan:1",
          source: "direct_plan",
          plan_id: "plan1",
          offer_installments: 3,
          installments_paid: 1,
          offer_settlement_amount: 900_000,
          amount_paid: 300_000
        })}
      />
    );

    expect(screen.getByText("Plan · 3 cuotas · COP 900.000")).toBeInTheDocument();
    expect(screen.getByText(/1 de 3 cuotas pagadas/)).toBeInTheDocument();
  });

  it("trae el último mensaje del hilo donde se pactó", () => {
    render(
      <NegotiationCard
        commitment={makeItem({
          conversation_id: "conv1",
          conversation: {
            id: "conv1",
            channel: "whatsapp",
            last_message_at: "2026-03-06T15:00:00.000Z",
            last_message_direction: "in",
            last_message_preview: "Pago el viernes sin falta"
          }
        })}
      />
    );

    expect(screen.getByText(/Último mensaje del deudor/)).toBeInTheDocument();
    expect(screen.getByText(/Pago el viernes sin falta/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir conversación" })).toHaveAttribute(
      "href",
      "/conversations/conv1"
    );
  });

  it("omite el enlace a la conversación cuando no hay hilo", () => {
    render(<NegotiationCard commitment={makeItem()} />);

    expect(
      screen.queryByRole("link", { name: "Abrir conversación" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver cuenta" })).toHaveAttribute(
      "href",
      "/debts/debt1"
    );
  });
});
