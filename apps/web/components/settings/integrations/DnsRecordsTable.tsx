"use client";

import { AlertTriangle, Check, CheckCircle2, Copy } from "lucide-react";
import { useState } from "react";
import type { IntegrationView } from "../../../lib/types";
import { CopyButton } from "../../shared/CopyButton";

export type DnsRecord = NonNullable<IntegrationView["dnsRecords"]>[number];

export interface DnsRecordsTableProps {
  records: DnsRecord[];
  onRecheck: () => void;
  isRechecking: boolean;
}

const COPY_ALL_FEEDBACK_MS = 2000;

function recordStatusIcon(record: DnsRecord): React.ReactElement {
  return record.verified ? (
    <span className="inline-flex items-center gap-1 text-[#0F6E56]">
      <CheckCircle2 className="h-4 w-4" />
      <span className="sr-only">Registro válido</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[#A32D2D]">
      <AlertTriangle className="h-4 w-4" />
      <span className="sr-only">Registro inválido</span>
    </span>
  );
}

/**
 * D-03 CNAME instructions. Two sibling renderings — a real `<table>` for
 * `sm:` and up, a stacked `<dl>` below it — switched purely with Tailwind
 * responsive classes (Responsive Behavior: "the values are too long for a
 * narrow table"), matching how the rest of the dashboard handles breakpoints
 * (no JS `matchMedia`/resize listener).
 */
export function DnsRecordsTable({
  records,
  onRecheck,
  isRechecking
}: DnsRecordsTableProps): React.ReactElement {
  const [copiedAll, setCopiedAll] = useState(false);

  async function handleCopyAll(): Promise<void> {
    const block = records.map((r) => `${r.type}\t${r.host}\t${r.value}`).join("\n");
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(block).catch(() => undefined);
    }
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), COPY_ALL_FEEDBACK_MS);
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">Registros CNAME</span>
        <button
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => void handleCopyAll()}
          type="button"
        >
          {copiedAll ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          Copiar todos
        </button>
      </div>

      <table className="mt-2 hidden w-full sm:table">
        <caption className="sr-only">Registros CNAME requeridos</caption>
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="sr-only" scope="col">
              Estado
            </th>
            <th className="pb-1 font-medium" scope="col">
              Tipo
            </th>
            <th className="pb-1 font-medium" scope="col">
              Nombre
            </th>
            <th className="pb-1 font-medium" scope="col">
              Valor
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr className="border-t border-slate-100 dark:border-slate-800" key={`${record.type}-${record.host}`}>
              <td className="w-6 py-2">{recordStatusIcon(record)}</td>
              <td className="py-2 text-xs text-slate-600 dark:text-slate-400">{record.type}</td>
              <td className="py-2">
                <div className="flex items-center gap-1">
                  <span className="break-all font-mono text-xs">{record.host}</span>
                  <CopyButton label={`nombre de ${record.host}`} value={record.host} />
                </div>
              </td>
              <td className="py-2">
                <div className="flex items-center gap-1">
                  <span className="break-all font-mono text-xs">{record.value}</span>
                  <CopyButton label={`valor de ${record.host}`} value={record.value} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-2 space-y-3 sm:hidden">
        {records.map((record) => (
          <div
            className="rounded-md border border-slate-200 p-3 dark:border-slate-700"
            key={`${record.type}-${record.host}-stacked`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{record.type}</span>
              {recordStatusIcon(record)}
            </div>
            <dt className="mt-1 text-xs font-medium text-slate-500">Nombre</dt>
            <dd className="flex items-center gap-1">
              <span className="break-all font-mono text-xs">{record.host}</span>
              <CopyButton label={`nombre de ${record.host}`} value={record.host} />
            </dd>
            <dt className="mt-1 text-xs font-medium text-slate-500">Valor</dt>
            <dd className="flex items-center gap-1">
              <span className="break-all font-mono text-xs">{record.value}</span>
              <CopyButton label={`valor de ${record.host}`} value={record.value} />
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 text-xs text-slate-500">
        ¿Tu dominio lo administra otra persona? Copia estos registros y envíaselos.
      </p>

      <button
        className="mt-3 rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c24f29] disabled:opacity-60"
        disabled={isRechecking}
        onClick={onRecheck}
        type="button"
      >
        {isRechecking ? "Verificando…" : "Ya los publiqué, verificar"}
      </button>
    </div>
  );
}
