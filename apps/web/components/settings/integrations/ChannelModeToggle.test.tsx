import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChannelModeToggle } from "./ChannelModeToggle";

const DEDICATED = "Cuenta de envío dedicada";

describe("ChannelModeToggle", () => {
  it("voz pone BYO primero y la compra de número segunda y bloqueada", () => {
    const onChange = vi.fn();
    render(<ChannelModeToggle channel="voice" mode="byo" onChange={onChange} />);

    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["Traer mis credenciales", "Comprar número en Twilio"]);
    expect(screen.queryByText(DEDICATED)).not.toBeInTheDocument();

    const buy = screen.getByRole("button", { name: "Comprar número en Twilio" });
    expect(buy).toBeDisabled();
    fireEvent.click(buy);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("WhatsApp pone BYO primero y la gestionada segunda y bloqueada", () => {
    const onChange = vi.fn();
    render(<ChannelModeToggle channel="whatsapp" mode="byo" onChange={onChange} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Traer mis credenciales",
      "Gestionado por CobraAI"
    ]);

    const managed = screen.getByRole("button", { name: "Gestionado por CobraAI" });
    expect(managed).toBeDisabled();
    fireEvent.click(managed);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("WhatsApp explica por qué la gestionada está bloqueada", () => {
    render(<ChannelModeToggle channel="whatsapp" mode="byo" onChange={vi.fn()} />);
    expect(screen.getByText(/app de Meta aprobada/i)).toBeInTheDocument();
  });

  it("correo ofrece tres opciones con BYO en segundo lugar y la dedicada al final", () => {
    render(<ChannelModeToggle channel="email" mode="managed" onChange={vi.fn()} />);

    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["Gestionado por CobraAI", "Traer mis credenciales", DEDICATED]);
  });

  it("la opción dedicada está deshabilitada y no puede seleccionarse", () => {
    const onChange = vi.fn();
    render(<ChannelModeToggle channel="email" mode="managed" onChange={onChange} />);

    const dedicated = screen.getByRole("button", { name: DEDICATED });
    expect(dedicated).toBeDisabled();

    fireEvent.click(dedicated);
    expect(onChange).not.toHaveBeenCalled();
  });

  // El motivo tiene que verse sin seleccionar la opción: como está deshabilitada,
  // el usuario nunca podría llegar a su texto de ayuda.
  it("explica por qué la opción dedicada no está disponible sin tener que elegirla", () => {
    render(<ChannelModeToggle channel="email" mode="managed" onChange={vi.fn()} />);

    expect(screen.getByText(/permisos de subusuarios/i)).toBeInTheDocument();
  });

  it("la opción gestionada de correo dice que el envío es compartido", () => {
    render(<ChannelModeToggle channel="email" mode="managed" onChange={vi.fn()} />);

    expect(screen.getByText(/cuenta compartida de CobraAI/i)).toBeInTheDocument();
  });

  it("las opciones seleccionables siguen funcionando", () => {
    const onChange = vi.fn();
    render(<ChannelModeToggle channel="email" mode="managed" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Traer mis credenciales" }));
    expect(onChange).toHaveBeenCalledWith("byo");
  });
});
