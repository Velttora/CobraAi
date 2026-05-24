"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  useToggleWorkflowRule,
  useWorkflowQueue,
  useWorkflowRules,
  useWorkflowStats,
  type WorkflowRule
} from "../../../../hooks/use-workflows";

export default function AutomationSettingsPage(): React.ReactElement {
  const rulesQuery = useWorkflowRules();
  const queueQuery = useWorkflowQueue();
  const statsQuery = useWorkflowStats();
  const toggleRule = useToggleWorkflowRule();

  const rulesList: WorkflowRule[] = rulesQuery.data?.data ?? [];
  const queue = queueQuery.data?.data;
  const stats = statsQuery.data?.data;

  return (
    <section className="space-y-6">
      <header>
        <Link
          className="text-sm text-[#D85A30] hover:underline"
          href={"/settings" as Route}
        >
          ← Configuración
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
          Automatización
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Reglas de workflow, cola del día y estadísticas
        </p>
      </header>

      {stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Contactos hoy" value={stats.contacts_today} />
          <StatCard label="Promesas activas" value={stats.active_promises} />
          <StatCard label="Escalamientos hoy" value={stats.escalations_today} />
          <StatCard label="Ejecuciones hoy" value={stats.executions_today} />
        </div>
      ) : null}

      <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold">Cola del día</h2>
        {queue ? (
          <ul className="mt-3 space-y-2">
            {queue.items.length === 0 ? (
              <li className="text-sm text-slate-500">Sin contactos programados</li>
            ) : (
              queue.items.map((item) => (
                <li
                  className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950"
                  key={item.channel}
                >
                  <span className="capitalize">{item.channel}</span>
                  <span className="font-medium">{item.count}</span>
                </li>
              ))
            )}
            <li className="pt-2 text-xs text-slate-500">
              Total: {queue.total} · {queue.date}
            </li>
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Cargando cola...</p>
        )}
      </article>

      <article className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <h2 className="border-b border-slate-200 px-5 py-4 text-sm font-semibold dark:border-slate-800">
          Reglas activas
        </h2>
        <ul>
          {rulesList.map((rule) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 last:border-0 dark:border-slate-800"
              key={rule.id}
            >
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {rule.name}
                </p>
                <p className="text-xs text-slate-500">
                  {rule.trigger} → {rule.action}
                  {rule.channel ? ` · ${rule.channel}` : ""}
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  checked={rule.isActive}
                  disabled={toggleRule.isPending}
                  onChange={(e) =>
                    toggleRule.mutate({ id: rule.id, isActive: e.target.checked })
                  }
                  type="checkbox"
                />
                Activa
              </label>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </article>
  );
}
