import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DnsRecordsTable, type DnsRecord } from "./DnsRecordsTable";

const RECORDS: DnsRecord[] = [
  { type: "CNAME", host: "s1._domainkey.tuempresa.com", value: "s1.domainkey.u12345.wl.sendgrid.net", verified: true },
  { type: "CNAME", host: "s2._domainkey.tuempresa.com", value: "s2.domainkey.u12345.wl.sendgrid.net", verified: false },
  { type: "CNAME", host: "em1234.tuempresa.com", value: "u12345.wl.sendgrid.net", verified: true }
];

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

describe("DnsRecordsTable — estructura", () => {
  it("renderiza un <table> con caption sr-only y columnas Tipo · Nombre · Valor", () => {
    render(<DnsRecordsTable isRechecking={false} onRecheck={vi.fn()} records={RECORDS} />);

    const caption = screen.getByText("Registros CNAME requeridos");
    expect(caption.tagName).toBe("CAPTION");
    expect(caption).toHaveClass("sr-only");

    // "Nombre"/"Valor" appear twice — once as the table's <th>, once as the
    // stacked (<sm) <dl>'s <dt> — both renderings coexist in the DOM,
    // switched purely via Tailwind's responsive display classes.
    expect(screen.getAllByText("Tipo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nombre").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Valor").length).toBeGreaterThan(0);
  });

  it("las celdas Nombre y Valor usan font-mono text-xs break-all y tienen un CopyButton", () => {
    render(<DnsRecordsTable isRechecking={false} onRecheck={vi.fn()} records={RECORDS} />);

    const hostCell = screen.getAllByText(RECORDS[0]!.host)[0]!;
    expect(hostCell.className).toContain("font-mono");
    expect(hostCell.className).toContain("break-all");

    expect(screen.getAllByRole("button", { name: `Copiar nombre de ${RECORDS[0]!.host}` }).length).toBeGreaterThan(0);
  });

  it("tiene al menos dos usos de sr-only: el caption y el estado por registro", () => {
    const { container } = render(<DnsRecordsTable isRechecking={false} onRecheck={vi.fn()} records={RECORDS} />);
    expect(container.querySelectorAll(".sr-only").length).toBeGreaterThanOrEqual(2);
  });

  it("cada fila expone su estado como texto, no solo como color de ícono", () => {
    render(<DnsRecordsTable isRechecking={false} onRecheck={vi.fn()} records={RECORDS} />);
    expect(screen.getAllByText("Registro válido").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Registro inválido").length).toBeGreaterThan(0);
  });

  it("nota de dominio administrado por otra persona", () => {
    render(<DnsRecordsTable isRechecking={false} onRecheck={vi.fn()} records={RECORDS} />);
    expect(
      screen.getByText("¿Tu dominio lo administra otra persona? Copia estos registros y envíaselos.")
    ).toBeInTheDocument();
  });
});

describe("DnsRecordsTable — Copiar todos", () => {
  it("copia un bloque separado por tabs con todos los registros", async () => {
    render(<DnsRecordsTable isRechecking={false} onRecheck={vi.fn()} records={RECORDS} />);

    fireEvent.click(screen.getByRole("button", { name: /Copiar todos/ }));

    await Promise.resolve();
    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = writeText.mock.calls[0]![0] as string;
    for (const record of RECORDS) {
      expect(payload).toContain(`${record.type}\t${record.host}\t${record.value}`);
    }
  });
});

describe("DnsRecordsTable — recheck", () => {
  it("wired to onRecheck y refleja isRechecking", () => {
    const onRecheck = vi.fn();
    const { rerender } = render(<DnsRecordsTable isRechecking={false} onRecheck={onRecheck} records={RECORDS} />);

    fireEvent.click(screen.getByRole("button", { name: "Ya los publiqué, verificar" }));
    expect(onRecheck).toHaveBeenCalledTimes(1);

    rerender(<DnsRecordsTable isRechecking onRecheck={onRecheck} records={RECORDS} />);
    const button = screen.getByRole("button", { name: "Verificando…" });
    expect(button).toBeDisabled();
  });
});
