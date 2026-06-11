"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { Route } from "next";
import {
  useConversations,
  useResolveEscalation
} from "../../../hooks/use-conversations";
import { usePortfolios } from "../../../hooks/use-portfolios";
import { cn } from "../../../lib/utils";
import { formatDateTime, formatDuration } from "../../../lib/formatters";
import { channelLabel } from "../../../lib/contact-channels";

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

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "Todos los estados" },
  { value: "escalated", label: "Escaladas" },
  { value: "open", label: "Abiertas" },
  { value: "pending", label: "Pendientes" },
  { value: "closed", label: "Cerradas" }
];

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

const TAB_LABELS: Record<Tab, string> = {
  all: "Todas",
  whatsapp: "WhatsApp",
  voice: "Voz",
  email: "Email"
};

export default function ConversationsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const [portfolioId, setPortfolioId] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [voiceOutcome, setVoiceOutcome] = useState("");
  const [resolveModal, setResolveModal] = useState<{ id: string } | null>(null);
  const [resolveOutcome, setResolveOutcome] = useState<"pending" | "promised">("pending");
  const [resolveNote, setResolveNote] = useState("");
  const resolve = useResolveEscalation();

  // Sync status filter from URL (e.g. from OpsDrawer navigation)
  useEffect(() => {
    const s = searchParams.get("status");
    if (s) setStatusFilter(s);
  }, [searchParams]);

  const { data: portfoliosData } = usePortfolios();
  const portfolios = portfoliosData?.data.items ?? [];
  const activePortfolio = portfolios.find((p) => p.id === portfolioId) ?? null;

  const channelFilter = tab === "all" ? undefined : tab;
  const { data, isLoading, error } = useConversations({
    channel: channelFilter,
    status: statusFilter || undefined,
    page,
    limit: 25,
    portfolioId: portfolioId || undefined,
    outcome: tab === "voice" && voiceOutcome ? voiceOutcome : undefined
  });

  const items = data?.data.items ?? [];
  const total = data?.data.total ?? 0;

  const activeFiltersCount = [portfolioId, statusFilter, tab !== "all" ? tab : "", voiceOutcome].filter(Boolean).length;

  function clearAllFilters() {
    setPortfolioId("");
    setStatusFilter("");
    setVoiceOutcome("");
    setTab("all");
    setPage(1);
    router.replace("/conversations");
  }

  function openResolveModal(id: string, e: React.MouseEvent) {
    e.preventDefault();
    setResolveOutcome("pending");
    setResolveNote("");
    setResolveModal({ id });
  }

  async function handleResolveConfirm() {
    if (!resolveModal) return;
    try {
      await resolve.mutateAsync({ id: resolveModal.id, outcome: resolveOutcome, note: resolveNote || undefined });
      toast.success(resolveOutcome === "pending" ? "Marcada como pendiente" : "Acuerdo registrado");
      setResolveModal(null);
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
          Historial de mensajes WhatsApp, llamadas de voz y email
        </p>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
        {/* Canal */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Canal</span>
          <div className="flex gap-1">
            {(["all", "whatsapp", "voice", "email"] as Tab[]).map((t) => (
              <button
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition",
                  tab === t
                    ? "bg-[#D85A30] text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                )}
                key={t}
                onClick={() => { setTab(t); setPage(1); setVoiceOutcome(""); }}
                type="button"
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Estado */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Estado</span>
          <select
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs outline-none transition focus:ring-2 focus:ring-[#D85A30]/30 dark:bg-slate-800",
              statusFilter
                ? "border-[#D85A30] bg-orange-50 font-semibold text-[#D85A30] dark:bg-[#D85A30]/10 dark:text-orange-400"
                : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:text-slate-300"
            )}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            value={statusFilter}
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Portafolio */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Portafolio</span>
          <select
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs outline-none transition focus:ring-2 focus:ring-[#D85A30]/30 dark:bg-slate-800",
              portfolioId
                ? "border-[#D85A30] bg-orange-50 font-semibold text-[#D85A30] dark:bg-[#D85A30]/10 dark:text-orange-400"
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
        </div>

        {/* Resultado — solo visible en tab Voz */}
        {tab === "voice" && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Resultado</span>
            <select
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs outline-none transition focus:ring-2 focus:ring-[#D85A30]/30 dark:bg-slate-800",
                voiceOutcome
                  ? "border-[#D85A30] bg-orange-50 font-semibold text-[#D85A30] dark:bg-[#D85A30]/10 dark:text-orange-400"
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

        {/* Limpiar filtros */}
        {activeFiltersCount > 0 && (
          <button
            className="ml-auto self-end rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-white hover:text-slate-700 dark:border-slate-700 dark:hover:bg-slate-800"
            onClick={clearAllFilters}
            type="button"
          >
            ✕ Limpiar filtros ({activeFiltersCount})
          </button>
        )}
      </div>

      {/* Resumen de filtros activos */}
      {(statusFilter || portfolioId || activeFiltersCount > 1) && (
        <div className="flex flex-wrap gap-2">
          {statusFilter && (
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-medium",
              STATUS_LABELS[statusFilter]?.className ?? "bg-slate-100 text-slate-600"
            )}>
              {STATUS_LABELS[statusFilter]?.label ?? statusFilter}
              <button
                className="ml-0.5 opacity-60 hover:opacity-100"
                onClick={() => { setStatusFilter(""); setPage(1); }}
                type="button"
              >×</button>
            </span>
          )}
          {activePortfolio && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-0.5 text-xs font-medium text-[#D85A30] dark:bg-[#D85A30]/10 dark:text-orange-400">
              {activePortfolio.name}
              <button
                className="ml-0.5 opacity-60 hover:opacity-100"
                onClick={() => { setPortfolioId(""); setPage(1); }}
                type="button"
              >×</button>
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-red-500">Error al cargar conversaciones</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center dark:border-slate-800">
          <p className="text-sm font-medium text-slate-500">Sin conversaciones</p>
          <p className="mt-1 text-xs text-slate-400">
            {statusFilter
              ? `No hay conversaciones con estado "${STATUS_LABELS[statusFilter]?.label ?? statusFilter}"`
              : portfolioId
              ? `Sin conversaciones en "${activePortfolio?.name ?? portfolioId}"`
              : "No se encontraron conversaciones con los filtros actuales"}
          </p>
          {activeFiltersCount > 0 && (
            <button
              className="mt-3 text-xs text-[#D85A30] hover:underline"
              onClick={clearAllFilters}
              type="button"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">{total} conversaciones encontradas</p>
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Deudor</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Portafolio</th>
                  {tab === "voice" ? (
                    <>
                      <th className="px-4 py-3 text-left font-medium text-slate-500">Resultado</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-500">Duración</th>
                    </>
                  ) : (
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
                      className={cn(
                        "bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-900/50",
                        conv.status === "escalated" && "border-l-2 border-l-red-400"
                      )}
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
                      {tab === "voice" ? (
                        <>
                          <td className="px-4 py-3">
                            {outcomeInfo ? (
                              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", outcomeInfo.className)}>
                                {outcomeInfo.label}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {formatDuration(conv.last_call_duration ?? null)}
                          </td>
                        </>
                      ) : (
                        <td className="px-4 py-3 text-slate-500">
                          {channelLabel(conv.channel)}
                        </td>
                      )}
                      <td className="max-w-[200px] truncate px-4 py-3 text-slate-500">
                        {conv.last_message ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusInfo.className)}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {conv.last_message_at ? formatDateTime(conv.last_message_at) : "—"}
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
                              onClick={(e) => { openResolveModal(conv.id, e); }}
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
        </>
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

      {/* Modal resolver escalación */}
      {resolveModal && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Resolver escalación
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Indica el resultado del contacto con el deudor.
            </p>

            <fieldset className="mt-4 space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:border-[#D85A30] dark:border-slate-700 dark:hover:border-[#D85A30]">
                <input
                  checked={resolveOutcome === "pending"}
                  className="mt-0.5 accent-[#D85A30]"
                  onChange={() => setResolveOutcome("pending")}
                  type="radio"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Pendiente de confirmación</p>
                  <p className="text-xs text-slate-500">Hubo acuerdo pero aún no se confirmó el pago. La cuenta queda en espera.</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:border-[#D85A30] dark:border-slate-700 dark:hover:border-[#D85A30]">
                <input
                  checked={resolveOutcome === "promised"}
                  className="mt-0.5 accent-[#D85A30]"
                  onChange={() => setResolveOutcome("promised")}
                  type="radio"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Acuerdo registrado</p>
                  <p className="text-xs text-slate-500">El deudor se comprometió. La cuenta vuelve a la cola activa de gestión.</p>
                </div>
              </label>
            </fieldset>

            <label className="mt-4 block text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Nota <span className="font-normal text-slate-400">(opcional)</span></span>
              <textarea
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                onChange={(e) => setResolveNote(e.target.value)}
                placeholder="Ej: Acordó pagar el viernes 14"
                rows={2}
                value={resolveNote}
              />
            </label>

            <div className="mt-5 flex gap-2">
              <button
                className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29] disabled:opacity-50"
                disabled={resolve.isPending}
                onClick={() => { void handleResolveConfirm(); }}
                type="button"
              >
                Confirmar
              </button>
              <button
                className="rounded-md border border-slate-200 px-4 py-2 text-sm dark:border-slate-700"
                disabled={resolve.isPending}
                onClick={() => setResolveModal(null)}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
