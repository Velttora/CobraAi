"use client";

import { useState } from "react";
import { CallCard } from "../../../components/calls/CallCard";
import { useCalls } from "../../../hooks/use-calls";

const OUTCOME_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "promise_made", label: "Promesa de pago" },
  { value: "no_answer", label: "Sin respuesta" },
  { value: "voicemail", label: "Buzón de voz" },
  { value: "refused", label: "Rechazó" },
  { value: "payment_received", label: "Pago recibido" }
];

export default function CallsPage() {
  const [outcome, setOutcome] = useState("");
  const { data, isLoading, error } = useCalls({ outcome: outcome || undefined });
  const calls = data?.data.items ?? [];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Llamadas de Voz
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Historial de llamadas realizadas por el agente de voz AI
        </p>
      </header>

      {/* Filtros */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Filtrar por resultado:
        </label>
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-[#D85A30] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          onChange={(e) => { setOutcome(e.target.value); }}
          value={outcome}
        >
          {OUTCOME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-400">
          {calls.length} llamada{calls.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-slate-400">Cargando llamadas…</p>
      ) : error ? (
        <p className="text-sm text-red-500">Error al cargar llamadas</p>
      ) : calls.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900/30">
          <p className="text-slate-400">No hay llamadas registradas</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {calls.map((call) => (
            <CallCard
              contact={{
                id: call.id,
                channel: call.channel,
                outcome: call.outcome,
                duration: call.durationSeconds,
                transcript: call.transcriptUrl,
                summary: null,
                createdAt: call.createdAt,
                debtor: call.debtor ?? undefined
              }}
              key={call.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
