import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationThread } from "./ConversationThread";
import type { ConversationMessage } from "../../hooks/use-conversations";

const messages: ConversationMessage[] = [
  {
    id: "m1",
    direction: "out",
    channel: "whatsapp",
    text: "Le recordamos su saldo",
    voice: null,
    human_sent: false,
    status: "sent",
    sent_at: "2026-06-01T10:00:00Z"
  },
  {
    id: "m2",
    direction: "in",
    channel: "whatsapp",
    text: "¿Puedo pagar en cuotas?",
    voice: null,
    human_sent: false,
    status: "delivered",
    sent_at: "2026-06-01T10:05:00Z"
  }
];

describe("ConversationThread", () => {
  it("isLoading → muestra estado de carga, sin mensajes", () => {
    render(<ConversationThread isLoading messages={[]} />);

    expect(screen.getByText("Cargando conversación…")).toBeInTheDocument();
  });

  it("sin mensajes → estado vacío", () => {
    render(<ConversationThread messages={[]} />);

    expect(screen.getByText("Sin mensajes aún")).toBeInTheDocument();
  });

  it("con mensajes → renderiza todos en orden", () => {
    render(<ConversationThread messages={messages} />);

    expect(screen.getByText("Le recordamos su saldo")).toBeInTheDocument();
    expect(screen.getByText("¿Puedo pagar en cuotas?")).toBeInTheDocument();
  });
});
