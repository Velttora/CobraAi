import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EMPTY_BRAND_IDENTITY, type BrandIdentity } from "@cobrai/utils";
import { toast } from "sonner";
import { BrandIdentityPanel } from "./BrandIdentityPanel";

const useAuthMock = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => useAuthMock()
}));

const useTenantMock = vi.fn();
const mutateAsyncMock = vi.fn();
const useUpdateBrandIdentityMock = vi.fn();
vi.mock("../../../hooks/use-tenant", () => ({
  useTenant: () => useTenantMock(),
  useUpdateBrandIdentity: () => useUpdateBrandIdentityMock()
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}));

function tenantData(brandIdentity: Partial<BrandIdentity> = {}) {
  return {
    data: {
      data: {
        id: "t1",
        name: "Acme",
        slug: "acme",
        plan: "pro",
        contactRetryPolicy: {
          windowHours: 24,
          maxAttempts: 3,
          escalation: "switch_channel",
          escalateTo: "human"
        },
        brandIdentity: { ...EMPTY_BRAND_IDENTITY, ...brandIdentity }
      }
    },
    isLoading: false,
    isError: false
  };
}

describe("BrandIdentityPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ orgRole: "org:admin" });
    useUpdateBrandIdentityMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false
    });
  });

  it("renderiza los tres fieldsets con sus campos", () => {
    useTenantMock.mockReturnValue(tenantData({ commercialName: "Acme Cobranzas" }));
    render(<BrandIdentityPanel />);

    expect(screen.getByRole("group", { name: "Identidad" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Contacto" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Firma legal" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre comercial/)).toBeInTheDocument();
    expect(screen.getByLabelText("Razón social")).toBeInTheDocument();
  });

  it("muestra el hint de fallback bajo Nombre comercial", () => {
    useTenantMock.mockReturnValue(tenantData());
    render(<BrandIdentityPanel />);

    expect(
      screen.getByText(
        'Es el nombre que ve el deudor en cada mensaje. Si lo dejas vacío, aparecerá "su gestor de cobranza".'
      )
    ).toBeInTheDocument();
  });

  it("marca Nombre comercial como requerido con aria-required y un marcador visible", () => {
    useTenantMock.mockReturnValue(tenantData());
    render(<BrandIdentityPanel />);

    const input = screen.getByLabelText(/Nombre comercial/);
    expect(input).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando no hay nombre comercial", () => {
    useTenantMock.mockReturnValue(tenantData({ commercialName: null }));
    render(<BrandIdentityPanel />);

    expect(screen.getByText("Tus mensajes salen sin marca")).toBeInTheDocument();
  });

  it("no muestra el estado vacío cuando hay nombre comercial", () => {
    useTenantMock.mockReturnValue(tenantData({ commercialName: "Acme" }));
    render(<BrandIdentityPanel />);

    expect(screen.queryByText("Tus mensajes salen sin marca")).not.toBeInTheDocument();
  });

  it("el botón de guardar está deshabilitado hasta que el formulario esté sucio", () => {
    useTenantMock.mockReturnValue(tenantData({ commercialName: "Acme" }));
    render(<BrandIdentityPanel />);

    const button = screen.getByRole("button", { name: "Guardar identidad" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Nombre comercial/), {
      target: { value: "Acme Cobranzas" }
    });
    expect(button).not.toBeDisabled();
  });

  it("al guardar exitosamente llama a la mutación y muestra el toast de éxito", async () => {
    useTenantMock.mockReturnValue(tenantData({ commercialName: "Acme" }));
    mutateAsyncMock.mockResolvedValue({});
    render(<BrandIdentityPanel />);

    fireEvent.change(screen.getByLabelText(/Nombre comercial/), {
      target: { value: "Acme Cobranzas" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar identidad" }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Identidad de marca actualizada");
  });

  it("al fallar el guardado muestra el toast de error", async () => {
    useTenantMock.mockReturnValue(tenantData({ commercialName: "Acme" }));
    mutateAsyncMock.mockRejectedValue(new Error("network"));
    render(<BrandIdentityPanel />);

    fireEvent.change(screen.getByLabelText(/Nombre comercial/), {
      target: { value: "Acme Cobranzas" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar identidad" }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith("No se pudo guardar la identidad de marca");
  });

  it("un no-admin ve la vista de solo lectura y ningún formulario", () => {
    useAuthMock.mockReturnValue({ orgRole: "org:viewer" });
    useTenantMock.mockReturnValue(tenantData({ commercialName: "Acme" }));
    render(<BrandIdentityPanel />);

    expect(screen.queryByRole("button", { name: "Guardar identidad" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Solo un administrador puede cambiar esta configuración.")
    ).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("notifica el draft en vivo vía onDraftChange", () => {
    useTenantMock.mockReturnValue(tenantData({ commercialName: "Acme" }));
    const onDraftChange = vi.fn();
    render(<BrandIdentityPanel onDraftChange={onDraftChange} />);

    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({ commercialName: "Acme" })
    );

    fireEvent.change(screen.getByLabelText(/Nombre comercial/), {
      target: { value: "Acme Cobranzas" }
    });
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ commercialName: "Acme Cobranzas" })
    );
  });
});
