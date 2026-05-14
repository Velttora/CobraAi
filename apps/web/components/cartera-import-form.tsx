"use client";

import { useMemo, useState } from "react";
import { getApiOrigin } from "../services/api/axios-instance";
import { getCarteraTemplateDownloadUrl } from "../services/cartera/cartera-import.api";
import type { CarteraImportSummary } from "../services/cartera/cartera-import.schema";
import { useCarteraImportMutation } from "../hooks/use-cartera-import-mutation";

export function CarteraImportForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const importMutation = useCarteraImportMutation();

  const summary = importMutation.data ?? null;
  const errorMessage = importMutation.isError
    ? importMutation.error instanceof Error
      ? importMutation.error.message
      : "Error inesperado."
    : null;

  const errorReportHref = useMemo(() => {
    if (!summary?.errorReportUrl) {
      return undefined;
    }

    return `${getApiOrigin()}${summary.errorReportUrl}`;
  }, [summary]);

  function uploadFile() {
    if (!selectedFile) {
      setClientError("Selecciona un archivo Excel antes de importar.");
      return;
    }

    setClientError(null);
    importMutation.mutate(selectedFile);
  }

  return (
    <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Importar cartera</h2>
          <p className="mt-1 text-sm text-slate-600">
            Sube un Excel con clientes y facturas. El backend valida cada fila y evita
            duplicados por documento, telefono o factura.
          </p>
        </div>
        <a
          className="rounded-full border border-slate-300 px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
          href={getCarteraTemplateDownloadUrl()}
        >
          Descargar plantilla
        </a>
      </div>

      <label
        className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center hover:bg-slate-100"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setClientError(null);
          setSelectedFile(event.dataTransfer.files.item(0));
        }}
      >
        <span className="text-sm font-medium text-slate-700">
          Arrastra tu Excel aqui o haz click para seleccionarlo
        </span>
        <span className="mt-2 text-xs text-slate-500">Formatos soportados: .xlsx, .xls</span>
        <input
          accept=".xlsx,.xls"
          className="sr-only"
          onChange={(event) => {
            setClientError(null);
            setSelectedFile(event.target.files?.item(0) ?? null);
          }}
          type="file"
        />
      </label>

      {selectedFile ? (
        <p className="mt-3 text-sm text-slate-600">
          Archivo seleccionado: <span className="font-medium">{selectedFile.name}</span>
        </p>
      ) : null}

      <button
        className="mt-5 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={importMutation.isPending}
        onClick={uploadFile}
        type="button"
      >
        {importMutation.isPending ? "Importando..." : "Importar cartera"}
      </button>

      {clientError ? (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{clientError}</p>
      ) : null}

      {errorMessage ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      {summary ? <ImportSummaryPanel errorReportHref={errorReportHref} summary={summary} /> : null}
    </section>
  );
}

function ImportSummaryPanel({
  summary,
  errorReportHref
}: {
  summary: CarteraImportSummary;
  errorReportHref?: string;
}) {
  return (
    <div className="mt-6 rounded-2xl bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-950">Resultado</h3>
      <dl className="mt-3 grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Filas" value={summary.totalRows} />
        <Metric label="Validas" value={summary.successRows} />
        <Metric label="Errores" value={summary.errorRows} />
        <Metric label="Clientes creados" value={summary.createdClients} />
        <Metric label="Clientes actualizados" value={summary.updatedClients} />
        <Metric label="Facturas creadas" value={summary.createdInvoices} />
        <Metric label="Facturas actualizadas" value={summary.updatedInvoices} />
        <Metric label="Estado" value={summary.status} />
      </dl>
      {errorReportHref ? (
        <a
          className="mt-4 inline-flex text-sm font-medium text-slate-950 underline"
          href={errorReportHref}
        >
          Descargar reporte de errores
        </a>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-950">{value}</dd>
    </div>
  );
}
