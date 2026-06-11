"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import type { Route } from "next";
import {
  useConversations,
  useResolveEscalation
} from "../../../hooks/use-conversations";
import { usePortfolios } from "../../../hooks/use-portfolios";
import { cn } from "../../../lib/utils";
import { formatDateTime, formatDuration } from "../../../lib/formatters";

type Tab = "all" | "whatsapp" | "voice" | "email";

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

const OUTCOME_LABELS: Record<string, { label: string; className: string }> = {
  promise_made: {
    label: "Promesa de pago",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
  },
  payment_received: {
    label: "Pago recibido",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
  },
  no_answer: {
    label: "Sin respuesta",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
  },
  voicemail: {
    label: "Buzón de voz",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
  },
  refused: {
    label: "Rechazó",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
  }
};

const VOICE_OUTCOME_OPTIONS = [
  { value: "", label: "Todos los resultados" },
  { value: "promise_made", label: "Promesa de pago" },
  { value: "no_answer", label: "Sin respuesta" },
  { value: "voicemail", label: "Buzón de voz" },
  { value: "refused", label: "Rechazó" },
  { value: "payment_received", label: "Pago recibido" }
];

export default function ConversationsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const [portfolioId, setPortfolioId] = useState("");
  const [voiceOutcome, setVoiceOutcome] = useState("");
  const resolve = useResolveEscalation();

  const { data: portfoliosData } = usePortfolios();
  const portfolios = portfoliosData?.data.items ?? [];

  const activePortfolio = portfolios.find((p) => p.id === portfolioId) ?? null;

  const channelFilter = tab === "all" ? undefined : tab;
  const { data, isLoading, error } = useConversations({
    channel: channelFilter,
    page,
    limit: 25,
    portfolioId: portfolioId || undefined,
    outcome: tab === "voice" && voiceOutcome ? voiceOutcome : undefined
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Conversaciones
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Historial de mensajes WhatsApp, llamadas de voz y email
          </p>
        </div>

        {/* Selector de portafolio */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500 dark:text-slate-400">
            Portafolio
          </label>
          <select
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm outline-none transition focus:ring-2 focus:ring-[#D85A30]/30 dark:bg-slate-900",
              portfolioId
                ? "border-[#D85A30] bg-orange-50 font-medium text-[#D85A30] dark:bg-[#D85A30]/10 dark:text-orange-400"
                : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:text-slate-300"
            )}
            onChange={(e) => { setPortfolioId(e.target.value); setPage(1); }}
            value={portfolioId}
          >
            <option value="">Todos los portafolios</option>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {portfolioId && (
            <button
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              onClick={() => { setPortfolioId(""); setPage(1); }}
              type="button"
            >
              ✕ limpiar
            </button>
          )}
        </div>
      </header>

      {/* Tabs + badge de portafolio activo */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <div className="flex gap-2">
          {(["all", "whatsapp", "voice", "email"] as Tab[]).map((t) => (
            <button
              className={cn(
                "border-b-2 px-4 py-2 text-sm font-medium transition",
                tab === t
                  ? "border-[#D85A30] text-[#D85A30]"
                  : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              )}
              key={t}
              onClick={() => { setTab(t); setPage(1); setVoiceOutcome(""); }}
              type="button"
            >
              {t === "all" ? "Todas" : t === "whatsapp" ? "WhatsApp" : t === "voice" ? "Voz" : "Email"}
            </button>
          ))}
        </div>
        {activePortfolio && (
          <span className="mb-1 rounded-full bg-orange-100 px-3 py-0.5 text-xs font-medium text-[#D85A30] dark:bg-[#D85A30]/10 dark:text-orange-400">
            {activePortfolio.name}
          </span>
        )}
      </div>

      {/* Filtro de resultado — solo en tab Voz */}
      {tab === "voice" && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500 dark:text-slate-400">
            Resultado
          </label>
          <select
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm outline-none transition focus:ring-2 focus:ring-[#D85A30]/30 dark:bg-slate-900",
              voiceOutcome
                ? "border-[#D85A30] bg-orange-50 font-medium text-[#D85A30] dark:bg-[#D85A30]/10 dark:text-orange-400"
                : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:text-slate-300"
            )}
            onChange={(e) => { setVoiceOutcome(e.target.value); setPage(1); }}
            value={voiceOutcome}
          >
            {VOICE_OUTCOME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-red-500">Error al cargar conversaciones</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400">
          {portfolioId
            ? `Sin conversaciones en "${activePortfolio?.name ?? portfolioId}"`
            : "Sin conversaciones"}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Deudor</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500">Portafolio</th>
                {tab === "voice" && (
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Resultado</th>
                )}
                {tab === "voice" && (
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Duración</th>
                )}
                {tab !== "voice" && (
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Canal</th>
                )}
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
                const outcomeInfo = conv.last_call_outcome
                  ? (OUTCOME_LABELS[conv.last_call_outcome] ?? null)
                  : null;
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
                    <td className="px-4 py-3">
                      {conv.portfolio ? (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {conv.portfolio.name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    {tab === "voice" && (
                      <td className="px-4 py-3">
                        {outcomeInfo ? (
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", outcomeInfo.className)}>
                            {outcomeInfo.label}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                    )}
                    {tab === "voice" && (
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatDuration(conv.last_call_duration ?? null)}
                      </td>
                    )}
                    {tab !== "voice" && (
                      <td className="px-4 py-3 capitalize text-slate-500">
                        {conv.channel}
                      </td>
                    )}
                    <td className="max-w-[200px] truncate px-4 py-3 text-slate-500">
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
                        ? formatDateTime(conv.last_message_at)
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
