import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SecretField } from "./SecretField";

const FULL_SECRET = "sk_live_super_secret_9f8a7b6c5d4e3f2a1";

describe("SecretField — Empty state", () => {
  it("renderiza un <input type=password autoComplete=off> editable con el hint esperado", () => {
    render(<SecretField label="Auth Token" meta={null} name="authToken" onChange={vi.fn()} />);

    const input = screen.getByLabelText("Auth Token") as HTMLInputElement;
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autoComplete", "off");
    expect(input.value).toBe("");
    expect(
      screen.getByText("Se guarda cifrada. No la volveremos a mostrar.")
    ).toBeInTheDocument();
  });

  it("no tiene ningún botón de revelar (eye toggle)", () => {
    render(<SecretField label="Auth Token" meta={null} name="authToken" onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /mostrar|revelar/i })).not.toBeInTheDocument();
  });
});

describe("SecretField — Filled state", () => {
  const meta = { field: "authToken", lastFour: "4242", savedAt: "2026-08-01T10:00:00Z" };

  it("no renderiza ningún input; muestra los últimos 4 dígitos con aria-label", () => {
    render(<SecretField label="Auth Token" meta={meta} name="authToken" onChange={vi.fn()} />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).not.toBeInTheDocument();

    const masked = screen.getByLabelText("Llave secreta terminada en 4242");
    expect(masked).toHaveTextContent("4242");
  });

  it("ofrece un botón Reemplazar", () => {
    render(<SecretField label="Auth Token" meta={meta} name="authToken" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Reemplazar" })).toBeInTheDocument();
  });
});

describe("SecretField — Rotating state", () => {
  const meta = { field: "authToken", lastFour: "4242", savedAt: "2026-08-01T10:00:00Z" };

  it("clic en Reemplazar muestra un input vacío y autofocado, nunca prellenado", () => {
    render(<SecretField label="Auth Token" meta={meta} name="authToken" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Reemplazar" }));

    const input = screen.getByLabelText("Auth Token") as HTMLInputElement;
    expect(input).toHaveAttribute("type", "password");
    expect(input.value).toBe("");
    expect(input).toHaveFocus();
  });
});

describe("SecretField — lifecycle clearing (D-26)", () => {
  it("limpia el valor local al desmontar", () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <SecretField label="Auth Token" meta={null} name="authToken" onChange={onChange} />
    );

    const input = screen.getByLabelText("Auth Token") as HTMLInputElement;
    fireEvent.change(input, { target: { value: FULL_SECRET } });
    expect(onChange).toHaveBeenCalledWith(FULL_SECRET);

    expect(() => unmount()).not.toThrow();
  });

  it("limpia el valor local tras un guardado exitoso (nuevo savedAt en meta)", () => {
    const onChange = vi.fn();
    const meta = { field: "authToken", lastFour: "4242", savedAt: "2026-08-01T10:00:00Z" };

    const { rerender } = render(
      <SecretField label="Auth Token" meta={meta} name="authToken" onChange={onChange} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reemplazar" }));
    const input = screen.getByLabelText("Auth Token") as HTMLInputElement;
    fireEvent.change(input, { target: { value: FULL_SECRET } });
    expect(input.value).toBe(FULL_SECRET);

    const newMeta = { field: "authToken", lastFour: "9999", savedAt: "2026-08-04T10:00:00Z" };
    rerender(<SecretField label="Auth Token" meta={newMeta} name="authToken" onChange={onChange} />);

    // Back to Filled state — no input, and the previously typed value is gone.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).not.toBeInTheDocument();
    expect(screen.getByLabelText("Llave secreta terminada en 9999")).toBeInTheDocument();
  });
});

describe("SecretField — no leak into the DOM (D-26, T-08-08)", () => {
  it("Empty: escribir un secreto no aparece en container.innerHTML", () => {
    const { container } = render(
      <SecretField label="Auth Token" meta={null} name="authToken" onChange={vi.fn()} />
    );

    const input = screen.getByLabelText("Auth Token") as HTMLInputElement;
    fireEvent.change(input, { target: { value: FULL_SECRET } });

    expect(container.innerHTML).not.toContain(FULL_SECRET);
  });

  it("Rotating: escribir un secreto no aparece en container.innerHTML", () => {
    const meta = { field: "authToken", lastFour: "4242", savedAt: "2026-08-01T10:00:00Z" };
    const { container } = render(
      <SecretField label="Auth Token" meta={meta} name="authToken" onChange={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reemplazar" }));
    const input = screen.getByLabelText("Auth Token") as HTMLInputElement;
    fireEvent.change(input, { target: { value: FULL_SECRET } });

    expect(container.innerHTML).not.toContain(FULL_SECRET);
  });

  it("Filled: el valor completo nunca aparece, solo lastFour", () => {
    const meta = { field: "authToken", lastFour: "4242", savedAt: "2026-08-01T10:00:00Z" };
    const { container } = render(
      <SecretField label="Auth Token" meta={meta} name="authToken" onChange={vi.fn()} />
    );

    expect(container.innerHTML).not.toContain(FULL_SECRET);
    expect(container.innerHTML).toContain("4242");
  });
});
