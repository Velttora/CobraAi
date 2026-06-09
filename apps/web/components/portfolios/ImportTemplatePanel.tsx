"use client";

import { Download } from "lucide-react";
import { IMPORT_COLUMNS } from "../../lib/import-columns";

export function ImportTemplatePanel({
  layout = "default"
}: {
  layout?: "default" | "compact";
}): React.ReactElement {
  const compact = layout === "compact";

  return (
    <div
      className={
        compact
          ? "flex h-full min-h-[280px] flex-col rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          : "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      }
    >
      <div
        className={
          compact
            ? "flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
            : "flex items-start justify-between gap-4"
        }
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Formato CSV / Excel de CobraAI
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Detectamos las columnas automáticamente desde exports de SAP, Siigo,
            Odoo, Helisa y más. ¿Dudas? Descarga el template y súbelo abajo.
          </p>
        </div>
        <a
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29]"
          download="cobrai-template.csv"
          href="/templates/cobrai-template.csv"
        >
          <Download className="h-4 w-4" />
          Descargar template
        </a>
      </div>

      <div
        className={
          compact
            ? "mt-4 min-h-0 flex-1 overflow-auto"
            : "mt-4 overflow-x-auto"
        }
      >
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="pb-1.5 pr-4 text-left font-medium text-slate-700 dark:text-slate-300">
                Columna
              </th>
              <th className="pb-1.5 pr-4 text-left font-medium text-slate-700 dark:text-slate-300">
                Requerido
              </th>
              <th className="pb-1.5 text-left font-medium text-slate-700 dark:text-slate-300">
                Descripción
              </th>
            </tr>
          </thead>
          <tbody>
            {IMPORT_COLUMNS.map((col) => (
              <tr
                className="border-b border-slate-50 last:border-0 dark:border-slate-800/50"
                key={col.internal}
              >
                <td className="py-1.5 pr-4">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {col.label}
                  </span>
                  {col.internal !== col.label &&
                    col.internal !== "metadata_*" && (
                      <span className="ml-1.5 font-mono text-[10px] text-slate-400">
                        {col.internal}
                      </span>
                    )}
                </td>
                <td className="py-1.5 pr-4">
                  {col.req ? (
                    <span className="rounded-full bg-[#D85A30]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#D85A30]">
                      obligatorio
                    </span>
                  ) : (
                    <span className="text-slate-400">opcional</span>
                  )}
                </td>
                <td className="py-1.5 text-slate-500">{col.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
