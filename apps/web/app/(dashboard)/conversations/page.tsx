"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import type { Route } from "next";
import {
  useConversations,
  useResolveEscalation
} from "../../../hooks/use-conversations";
import { cn } from "../../../lib/utils";

type Tab = "all" | "whatsapp" | "voice";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  open: {
    label: "Abierta",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
  },
  pending: {
    label: "Pendiente",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
  },
  escalated: {
    label: "ESCALADA",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
  },
  closed: {
    label: "Cerrada",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
  },
  archived: {
    label: "Archivada",
    className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500"
  }
};

export default function ConversationsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const resolve = useResolveEscalation();

  const channelFilter = tab === "all" ? undefined : tab;
  const { data, isLoading, error } = useConversations({
    channel: channelFilter,
    page,
    limit: 25
  });

  const items = data?.data.items ?? [];
  const total = data?.data.total ?? 0;

  async function handleResolve(id: string, e: React.MouseEvent) {
    e.preventDefault();
    try {
      await resolve.mutateAsync(id);
      toast.success("Escalación resuelta");
    } catch {
      toast.error("Error al resolver la escalación");
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Conversaciones
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Historial de mensajes WhatsApp y llamadas de voz
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        {(["all", "whatsapp", "voice"] as Tab[]).map((t) => (
          <button
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition",
              tab === t
                ? "border-[#D85A30] text-[#D85A30]"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            )}
            key={t}
            onClick={() => { setTab(t); setPage(1); }}
            type="button"
          >
            {t === "all" ? "Todas" : t === "whatsapp" ? "WhatsApp" : "Voz"}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-red-500">Error al cargar conversaciones</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400">Sin conversaciones</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Deudor</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Canal</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Último mensaje</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((conv) => {
                const statusInfo = STATUS_LABELS[conv.status] ?? {
                  label: conv.status,
                  className: "bg-slate-100 text-slate-600"
                };
                return (
                  <tr
                    className="bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-900/50"
                    key={conv.id}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      <Link
                        className="hover:text-[#D85A30] hover:underline"
                        href={`/conversations/${conv.id}` as Route}
                      >
                        {conv.debtor.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-500">
                      {conv.channel}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-slate-500">
                      {conv.last_message ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          statusInfo.className
                        )}
                      >
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {conv.last_message_at
                        ? new Date(conv.last_message_at).toLocaleString("es-CO", {
                            dateStyle: "short",
                            timeStyle: "short"
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          className="text-xs font-medium text-[#D85A30] hover:underline"
                          href={`/conversations/${conv.id}` as Route}
                        >
                          Ver hilo
                        </Link>
                        {conv.status === "escalated" && (
                          <button
                            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                            disabled={resolve.isPending}
                            onClick={(e) => { void handleResolve(conv.id, e); }}
                            type="button"
                          >
                            Resolver
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {total > 25 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            {total} conversaciones · Página {page}
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-slate-200 px-3 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
              disabled={page === 1}
              onClick={() => { setPage((p) => p - 1); }}
              type="button"
            >
              Anterior
            </button>
            <button
              className="rounded-md border border-slate-200 px-3 py-1 text-xs disabled:opacity-40 dark:border-slate-700"
              disabled={page * 25 >= total}
              onClick={() => { setPage((p) => p + 1); }}
              type="button"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
