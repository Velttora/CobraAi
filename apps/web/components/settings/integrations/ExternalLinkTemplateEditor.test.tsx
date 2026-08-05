import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { resolveExternalLinkTemplate, validateExternalLinkTemplate } from "@cobrai/utils";
import { ExternalLinkTemplateEditor } from "./ExternalLinkTemplateEditor";

const SAMPLE_VALUES = { monto: "450000", ref: "FAC-00123", nombre: "María Rodríguez" };

/** Mirrors how `PaymentGatewayPanel` wires the editor: a controlled value plus a submit button gated on validity. */
function Harness({ initial = "" }: { initial?: string }): React.ReactElement {
  const [value, setValue] = useState(initial);
  const errors = validateExternalLinkTemplate(value);
  return (
    <div>
      <ExternalLinkTemplateEditor onChange={setValue} value={value} />
      <button disabled={errors.length > 0} type="button">
        Guardar y verificar
      </button>
    </div>
  );
}

describe("ExternalLinkTemplateEditor", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renderiza un input de una línea y tres chips {monto} {ref} {nombre}", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Plantilla del enlace de pago")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "{monto}" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "{ref}" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "{nombre}" })).toBeInTheDocument();
  });

  it("los chips son <button type=button>, nunca <span onClick>", () => {
    const { container } = render(<Harness />);
    expect(container.querySelectorAll('button[type="button"]').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll("span[onclick]")).toHaveLength(0);
  });

  it("clic en un chip inserta el token en la posición del cursor, no al final", () => {
    render(<Harness initial="https://x.co?a=1&b=2" />);
    const input = screen.getByLabelText("Plantilla del enlace de pago") as HTMLInputElement;

    // Place the caret right after "a=1&" (index 17), not at the end.
    input.focus();
    input.setSelectionRange(17, 17);

    fireEvent.click(screen.getByRole("button", { name: "{ref}" }));

    expect(input.value).toBe("https://x.co?a=1&{ref}b=2");
  });

  it("el botón de guardar se deshabilita con errores y se habilita con una plantilla válida", () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Guardar y verificar" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Plantilla del enlace de pago"), {
      target: { value: "https://checkout.tuempresa.com/pagar?ref={ref}" }
    });

    expect(button).not.toBeDisabled();
  });

  it("una plantilla que no empieza con https:// bloquea el guardado con el mensaje exacto", () => {
    render(<Harness initial="http://x.co?ref={ref}" />);
    expect(screen.getByText("El enlace debe empezar con https://")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar y verificar" })).toBeDisabled();
  });

  it("una plantilla sin {ref} ni {monto} bloquea el guardado con el mensaje exacto", () => {
    render(<Harness initial="https://x.co?a={nombre}" />);
    expect(screen.getByText("Incluye al menos {ref} para poder identificar el pago.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar y verificar" })).toBeDisabled();
  });

  it("una variable no reconocida muestra el mensaje nombrando el token", () => {
    render(<Harness initial="https://x.co?ref={ref}&x={factura}" />);
    expect(
      screen.getByText("No reconocemos {factura}. Variables válidas: {monto}, {ref}, {nombre}.")
    ).toBeInTheDocument();
  });

  it("los errores están enlazados al input vía aria-describedby y aria-invalid", () => {
    render(<Harness initial="http://x.co" />);
    const input = screen.getByLabelText("Plantilla del enlace de pago");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("muestra la nota de codificación de URL", () => {
    render(<Harness />);
    expect(screen.getByText("Los valores se codifican para la URL automáticamente.")).toBeInTheDocument();
  });

  it("la vista previa actualiza en vivo, debounced 300ms, dentro de una región aria-live=polite", async () => {
    vi.useFakeTimers();
    render(<Harness initial="https://x.co?ref={ref}" />);

    const template = "https://x.co?ref={ref}&monto={monto}&n={nombre}";
    fireEvent.change(screen.getByLabelText("Plantilla del enlace de pago"), { target: { value: template } });

    await vi.advanceTimersByTimeAsync(300);

    const expected = resolveExternalLinkTemplate(template, SAMPLE_VALUES);
    const preview = screen.getByText(expected);
    expect(preview.closest('[aria-live="polite"]')).toBeInTheDocument();
  });

  it("la vista previa usa resolveExternalLinkTemplate — coincide con su salida para el mismo input", () => {
    const template = "https://checkout.tuempresa.com/pagar?ref={ref}&valor={monto}";
    render(<Harness initial={template} />);

    const expected = resolveExternalLinkTemplate(template, SAMPLE_VALUES);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
