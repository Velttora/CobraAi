import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";
import type { IntegrationStatus } from "../../../lib/types";

const CASES: { status: IntegrationStatus; label: string; iconClass: string }[] = [
  { status: "not_configured", label: "Sin configurar", iconClass: "lucide-circle" },
  { status: "verifying", label: "Verificando…", iconClass: "lucide-loader-circle" },
  { status: "verified", label: "Verificado", iconClass: "lucide-circle-check" },
  { status: "failed", label: "Verificación fallida", iconClass: "lucide-triangle-alert" },
  { status: "pending_dns", label: "Falta publicar DNS", iconClass: "lucide-globe" },
  { status: "pending_meta", label: "Esperando a Meta", iconClass: "lucide-clock" }
];

describe("IntegrationStatusBadge", () => {
  for (const { status, label, iconClass } of CASES) {
    it(`estado ${status} → muestra ícono y etiqueta de texto`, () => {
      const { container } = render(<IntegrationStatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(container.querySelector(`svg.${iconClass}`)).toBeInTheDocument();
    });
  }

  it("verifying usa Loader2 con animate-spin", () => {
    const { container } = render(<IntegrationStatusBadge status="verifying" />);
    const icon = container.querySelector("svg.lucide-loader-circle");
    expect(icon).toHaveClass("animate-spin");
  });

  it("verified con verifiedAt muestra la fecha de verificación", () => {
    render(<IntegrationStatusBadge status="verified" verifiedAt="2026-08-04T14:31:00Z" />);
    expect(screen.getByText(/Verificado el/)).toBeInTheDocument();
  });
});
