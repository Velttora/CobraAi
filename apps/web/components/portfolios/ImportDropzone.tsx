"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { cn } from "../../lib/utils";

export function ImportDropzone({
  portfolioId,
  onJobCreated
}: {
  portfolioId: string;
  onJobCreated: (jobId: string) => void;
}) {
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
          body: form
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: { job_id: string };
          error?: { message?: string };
        };
        if (!res.ok || !json.success || !json.data?.job_id) {
          throw new Error(json.error?.message ?? "Error al importar");
        }
        toast.success("Importación iniciada");
        onJobCreated(json.data.job_id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al importar");
      } finally {
        setUploading(false);
      }
    },
    [onJobCreated, portfolioId]
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
  portfolioId,
  jobId
}: {
  portfolioId: string;
  jobId: string;
}) {
  const [status, setStatus] = useState<string>("queued");
  const [processed, setProcessed] = useState(0);
  const [success, setSuccess] = useState(0);
  const [errors, setErrors] = useState(0);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/import/${portfolioId}/${jobId}`);
        const json = (await res.json()) as {
          data?: {
            status: string;
            processed_rows?: number;
            success_rows?: number;
            error_rows?: number;
          };
        };
        if (json.data) {
          setStatus(json.data.status);
          setProcessed(json.data.processed_rows ?? 0);
          setSuccess(json.data.success_rows ?? 0);
          setErrors(json.data.error_rows ?? 0);
          if (["completed", "failed"].includes(json.data.status)) {
            clearInterval(timer);
          }
        }
      } catch {
        clearInterval(timer);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [jobId, portfolioId]);

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold">Progreso de importación</h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Estado: <span className="font-medium capitalize">{status}</span>
      </p>
      <ul className="mt-2 space-y-1 text-sm text-slate-500">
        <li>Procesadas: {processed}</li>
        <li>Exitosas: {success}</li>
        <li>Errores: {errors}</li>
      </ul>
    </section>
  );
}
