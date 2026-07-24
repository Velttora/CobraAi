import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReplyInput } from "./ReplyInput";
import { useReplyConversation } from "../../hooks/use-conversations";

vi.mock("../../hooks/use-conversations", () => ({
  useReplyConversation: vi.fn()
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}));

const mockUseReplyConversation = vi.mocked(useReplyConversation);

describe("ReplyInput", () => {
  const mockMutateAsync = vi.fn().mockResolvedValue({ success: true, data: { sent: true } });

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ success: true, data: { sent: true } });
    mockUseReplyConversation.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false
    } as unknown as ReturnType<typeof useReplyConversation>);
  });

  it("textarea vacío → botón Enviar deshabilitado", () => {
    render(<ReplyInput conversationId="conv1" />);

    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("escribe texto → botón se habilita; click envía y limpia el input", async () => {
    render(<ReplyInput conversationId="conv1" />);

    const textarea = screen.getByPlaceholderText(/Escribe tu respuesta/);
    fireEvent.change(textarea, { target: { value: "Claro, puede pagar el viernes" } });

    const button = screen.getByRole("button", { name: "Enviar" });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: "conv1",
        body: "Claro, puede pagar el viernes"
      });
    });
    await waitFor(() => {
      expect(textarea).toHaveValue("");
    });
  });

  it("solo espacios en blanco → no envía (botón deshabilitado)", () => {
    render(<ReplyInput conversationId="conv1" />);

    const textarea = screen.getByPlaceholderText(/Escribe tu respuesta/);
    fireEvent.change(textarea, { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("Ctrl+Enter → envía sin necesidad de click", async () => {
    render(<ReplyInput conversationId="conv1" />);

    const textarea = screen.getByPlaceholderText(/Escribe tu respuesta/);
    fireEvent.change(textarea, { target: { value: "Confirmado" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ id: "conv1", body: "Confirmado" });
    });
  });

  it("reply.isPending=true → botón deshabilitado y con texto 'Enviando...'", () => {
    mockUseReplyConversation.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true
    } as unknown as ReturnType<typeof useReplyConversation>);

    render(<ReplyInput conversationId="conv1" />);

    const button = screen.getByRole("button", { name: "Enviando..." });
    expect(button).toBeDisabled();
  });
});
