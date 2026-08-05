import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmailDnsSection } from "./EmailDnsSection";
import { view } from "./test-fixtures";

const recheckMock = { mutateAsync: vi.fn(), isPending: false };
vi.mock("../../../hooks/use-integrations", () => ({
  useRecheckDns: () => recheckMock
}));

beforeEach(() => {
  recheckMock.mutateAsync = vi.fn();
  recheckMock.isPending = false;
});

describe("EmailDnsSection", () => {
  it("no renderiza nada sin dnsRecords", () => {
    const { container } = render(<EmailDnsSection integration={view({ dnsRecords: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("pending_dns: tabla expandida con la instrucción de propagación", () => {
    render(
      <EmailDnsSection
        integration={view({
          status: "pending_dns",
          dnsRecords: [{ type: "CNAME", host: "s1._domainkey.tuempresa.com", value: "x.sendgrid.net", verified: false }]
        })}
      />
    );

    expect(
      screen.getByText(/Entra al panel de tu dominio y crea estos 3 registros CNAME/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Ver registros DNS publicados")).not.toBeInTheDocument();
  });

  it("failed: la tabla permanece visible", () => {
    render(
      <EmailDnsSection
        integration={view({
          status: "failed",
          failureMessage: "No encontramos el registro s1._domainkey.tuempresa.com",
          dnsRecords: [{ type: "CNAME", host: "s1._domainkey.tuempresa.com", value: "x.sendgrid.net", verified: false }]
        })}
      />
    );

    expect(screen.getByText("Registros CNAME")).toBeInTheDocument();
    expect(screen.queryByText("Ver registros DNS publicados")).not.toBeInTheDocument();
  });

  it("verified: la tabla colapsa en un <details> y muestra dónde llegan las respuestas", () => {
    render(
      <EmailDnsSection
        integration={view({
          status: "verified",
          publicConfig: { replyDomain: "reply.tuempresa.com" },
          dnsRecords: [{ type: "CNAME", host: "s1._domainkey.tuempresa.com", value: "x.sendgrid.net", verified: true }]
        })}
      />
    );

    const summary = screen.getByText("Ver registros DNS publicados");
    expect(summary.closest("details")).toBeInTheDocument();
    expect(
      screen.getByText("Las respuestas de tus deudores llegan a reply@reply.tuempresa.com.")
    ).toBeInTheDocument();
  });
});
