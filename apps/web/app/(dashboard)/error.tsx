"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        Algo salió mal
      </p>
      <p className="max-w-sm text-sm text-slate-500">
        {error.message ?? "Ocurrió un error inesperado. Intenta de nuevo."}
      </p>
      <button
        className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29]"
        onClick={reset}
        type="button"
      >
        Reintentar
      </button>
    </div>
  );
}
