import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

function renderDialog(tone: "danger" | "neutral" = "danger") {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <ConfirmDialog
      body="Dejaremos de enviar de inmediato."
      confirmLabel="Desconectar"
      onClose={onClose}
      onConfirm={onConfirm}
      title="¿Desconectar WhatsApp?"
      tone={tone}
    />
  );
  return { ...utils, onConfirm, onClose };
}

describe("ConfirmDialog", () => {
  it("renderiza con role=dialog, aria-modal=true y aria-labelledby ligado al título", () => {
    render(
      <ConfirmDialog
        body="body"
        confirmLabel="Confirmar"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Título"
        tone="neutral"
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy as string)).toHaveTextContent("Título");
  });

  it("mueve el foco inicial al botón Cancelar, nunca al destructivo", () => {
    renderDialog("danger");
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });

  it("Escape cierra el diálogo y restaura el foco al trigger", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Abrir";
    document.body.appendChild(trigger);
    trigger.focus();

    const onClose = vi.fn();
    const { unmount } = render(
      <ConfirmDialog
        body="body"
        confirmLabel="Confirmar"
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Título"
        tone="danger"
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("atrapa el foco con Tab dentro del diálogo", () => {
    renderDialog("danger");
    const cancelBtn = screen.getByRole("button", { name: "Cancelar" });
    const confirmBtn = screen.getByRole("button", { name: "Desconectar" });

    confirmBtn.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(cancelBtn).toHaveFocus();

    cancelBtn.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(confirmBtn).toHaveFocus();
  });

  it("tone=neutral cierra al hacer click en el overlay", () => {
    const { onClose, container } = renderDialog("neutral");
    const overlay = container.firstChild as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("tone=danger NO cierra al hacer click en el overlay", () => {
    const { onClose, container } = renderDialog("danger");
    const overlay = container.firstChild as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
  });
});
