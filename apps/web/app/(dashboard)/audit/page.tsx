"use client";

import { AUDIT_ACTION_FILTER_OPTIONS, describeAuditLog } from "@cobrai/utils";
import { useMemo, useState } from "react";
import { useAuditLogs, useIsAdmin } from "../../../hooks/use-audit";
import { useApiClient } from "../../../hooks/use-api-client";
import { formatDateTime } from "../../../lib/formatters";

export default function AuditPage(): React.ReactElement {
  const isAdmin = useIsAdmin();
  const client = useApiClient();
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const query = useAuditLogs({
    user_id: userId || undefined,
    action: action || undefined,
    from: from || undefined,
    to: to || undefined,
    page
  });

  const rows = query.data?.data.items ?? [];
  const pagination = query.data?.data.pagination;
  const totalPages = pagination?.total_pages ?? 1;

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (userId) params.set("user_id", userId);
    if (action) params.set("action", action);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/v1/audit-logs/export?${params.toString()}`;
  }, [userId, action, from, to]);

  if (!isAdmin) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">Auditoría</h1>
        <p className="text-sm text-[#A32D2D]">
          Acceso restringido. Solo usuarios con rol admin pueden ver el registro de auditoría.
        </p>
      </section>
    );
  }

  async function handleExport(): Promise<void> {
    const response = await client.get(exportUrl, { responseType: "blob" });
    const blob = new Blob([response.data as BlobPart], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-logs.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Auditoría
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Historial de contactos, cambios y accesos sensibles en tu organización.
          </p>
        </div>
        <button
          className="rounded-md border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
          onClick={() => void handleExport()}
          type="button"
        >
          Exportar CSV
        </button>
      </header>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          Usuario (ID Clerk)
          <input
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            onChange={(e) => {
              setUserId(e.target.value);
              setPage(1);
            }}
            placeholder="user_..."
            value={userId}
          />
        </label>
        <label className="text-sm">
          Tipo de acción
          <select
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            value={action}
          >
            {AUDIT_ACTION_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Desde
          <input
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            type="date"
            value={from}
          />
        </label>
        <label className="text-sm">
          Hasta
          <input
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            type="date"
            value={to}
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left dark:bg-slate-900">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Qué pasó</th>
              <th className="px-4 py-3">Sobre quién / qué</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>
                  Sin registros para los filtros seleccionados.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const readable = describeAuditLog(row);
                return (
                  <tr
                    className="border-t border-slate-100 dark:border-slate-800"
                    key={row.id}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {row.user?.name ?? row.user?.email ?? row.userId ?? "Sistema"}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {readable.action}
                      </p>
                      {readable.detail ? (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {readable.detail}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {readable.resourceLabel}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {row.ipAddress ?? "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total > pagination.limit ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {pagination.total} registros · Página {pagination.page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-slate-200 px-3 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              Anterior
            </button>
            <button
              className="rounded-md border border-slate-200 px-3 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              type="button"
            >
              Siguiente
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
