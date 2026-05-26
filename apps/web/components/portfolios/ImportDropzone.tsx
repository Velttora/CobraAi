"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useImportJobs } from "../../contexts/ImportJobsContext";
import { cn } from "../../lib/utils";

export function ImportDropzone({
  portfolioId,
  portfolioName
}: {
  portfolioId: string;
  portfolioName?: string;
}) {
  const { trackJob } = useImportJobs();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/import/${portfolioId}`, {
          method: "POST",
          body: form,
          keepalive: true
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: { job_id: string };
          error?: { message?: string };
        };
        if (!res.ok || !json.success || !json.data?.job_id) {
          throw new Error(json.error?.message ?? "Error al importar");
        }
        trackJob({
          portfolioId,
          jobId: json.data.job_id,
          portfolioName,
          fileName: file.name,
          startedAt: new Date().toISOString()
        });
        toast.success("Importación en curso — puedes cambiar de pestaña");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al importar");
      } finally {
        setUploading(false);
      }
    },
    [portfolioId, portfolioName, trackJob]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void upload(file);
    },
    [upload]
  );

  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition",
        dragging
          ? "border-[#D85A30] bg-[#D85A30]/5"
          : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900",
        uploading && "pointer-events-none opacity-60"
      )}
      onDragLeave={() => setDragging(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDrop={onDrop}
    >
      <Upload className="h-10 w-10 text-[#D85A30]" />
      <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
        Arrastra CSV o Excel aquí
      </p>
      <p className="mt-1 text-xs text-slate-500">o haz clic para seleccionar</p>
      <input
        accept=".csv,.xlsx,.xls"
        className="sr-only"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
        type="file"
      />
    </label>
  );
}

export function ImportProgress({
  portfolioId
}: {
  portfolioId: string;
}) {
  const { getJobForPortfolio } = useImportJobs();
  const job = getJobForPortfolio(portfolioId);

  if (!job) return null;

  const isActive = !["completed", "failed"].includes(job.status);
  const totalRows = job.estimated_rows || job.processed_rows;
  const progressPct =
    totalRows > 0
      ? Math.min(100, Math.round((job.processed_rows / totalRows) * 100))
      : isActive
        ? 8
        : 100;

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold">Progreso de importación</h3>
        {isActive ? (
          <span className="rounded-full bg-[#D85A30]/10 px-2 py-0.5 text-xs font-medium text-[#D85A30]">
            En segundo plano
          </span>
        ) : null}
      </div>
      {job.fileName ? (
        <p className="mt-1 truncate text-xs text-slate-500">{job.fileName}</p>
      ) : null}
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Estado: <span className="font-medium capitalize">{job.status}</span>
      </p>
      {isActive ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-[#D85A30] transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      ) : null}
      <ul className="mt-2 space-y-1 text-sm text-slate-500">
        <li>Procesadas: {job.processed_rows}</li>
        <li>Exitosas: {job.success_rows}</li>
        <li>Errores: {job.error_rows}</li>
      </ul>
      {isActive ? (
        <p className="mt-3 text-xs text-slate-400">
          La importación continúa aunque cambies de página o de pestaña del
          navegador.
        </p>
      ) : null}
    </section>
  );
}
