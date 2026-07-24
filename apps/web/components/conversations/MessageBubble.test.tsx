import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";

describe("MessageBubble", () => {
  it("mensaje de texto direction=out → alineado a la derecha con burbuja naranja", () => {
    render(
      <MessageBubble
        channel="whatsapp"
        direction="out"
        sentAt="2026-06-01T10:00:00Z"
        text="Le recordamos su saldo pendiente"
      />
    );

    expect(screen.getByText("Le recordamos su saldo pendiente")).toBeInTheDocument();
  });

  it("mensaje humano (human_sent) → muestra badge 'Agente humano'", () => {
    render(
      <MessageBubble
        channel="whatsapp"
        direction="out"
        humanSent
        sentAt="2026-06-01T10:00:00Z"
        text="Un agente le responde"
      />
    );

    expect(screen.getByText("Agente humano")).toBeInTheDocument();
  });

  it("mensaje generado por el agente IA (human_sent=false) → sin badge", () => {
    render(
      <MessageBubble
        channel="whatsapp"
        direction="out"
        humanSent={false}
        sentAt="2026-06-01T10:00:00Z"
        text="Respuesta del agente IA"
      />
    );

    expect(screen.queryByText("Agente humano")).not.toBeInTheDocument();
  });

  it("channel=voice con transcript → renderiza VoiceCallBubble y el transcript arranca oculto", () => {
    render(
      <MessageBubble
        channel="voice"
        direction="out"
        sentAt="2026-06-01T10:00:00Z"
        text=""
        voice={{ call_id: "call1", transcript: "Hola, le llamamos por su deuda...", summary: "Prometió pagar el viernes" }}
      />
    );

    expect(screen.getByText("Llamada de voz")).toBeInTheDocument();
    expect(screen.getByText("Prometió pagar el viernes")).toBeInTheDocument();
    expect(screen.queryByText(/Hola, le llamamos/)).not.toBeInTheDocument();
    expect(screen.getByText("Ver transcript")).toBeInTheDocument();
  });

  it("channel=voice → click en 'Ver transcript' lo despliega", () => {
    render(
      <MessageBubble
        channel="voice"
        direction="out"
        sentAt="2026-06-01T10:00:00Z"
        text=""
        voice={{ call_id: "call1", transcript: "Hola, le llamamos por su deuda...", summary: null }}
      />
    );

    fireEvent.click(screen.getByText("Ver transcript"));

    expect(screen.getByText(/Hola, le llamamos/)).toBeInTheDocument();
    expect(screen.getByText("Ocultar transcript")).toBeInTheDocument();
  });
});
