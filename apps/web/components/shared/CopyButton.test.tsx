import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CopyButton } from "./CopyButton";

describe("CopyButton", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("copia el value al portapapeles al hacer click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyButton label="URL" value="https://example.com/webhook" />);

    fireEvent.click(screen.getByRole("button", { name: "Copiar URL" }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith("https://example.com/webhook"));
  });

  it("cambia el ícono Copy por Check y vuelve a Copy tras 2 segundos", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { container } = render(<CopyButton label="URL" value="abc" />);
    expect(container.querySelector("svg.lucide-copy")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copiar URL" }));
    // Flush the microtask queue (the awaited writeText call) without advancing real time.
    await vi.advanceTimersByTimeAsync(0);

    expect(container.querySelector("svg.lucide-check")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000);

    expect(container.querySelector("svg.lucide-copy")).toBeInTheDocument();
  });

  it("anuncia 'Copiado' a través de una región aria-live=polite", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyButton label="URL" value="abc" />);

    fireEvent.click(screen.getByRole("button", { name: "Copiar URL" }));

    const liveRegion = await screen.findByText("Copiado");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
  });

  it("renderiza un <button> con aria-label='Copiar {label}'", () => {
    render(<CopyButton label="registro DNS" value="abc" />);
    expect(screen.getByRole("button", { name: "Copiar registro DNS" })).toBeInTheDocument();
  });

  it("usa selección de texto como fallback cuando navigator.clipboard no existe", async () => {
    Object.assign(navigator, { clipboard: undefined });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    render(<CopyButton label="valor" value="fallback-value" />);

    fireEvent.click(screen.getByRole("button", { name: "Copiar valor" }));

    await vi.waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
  });
});
