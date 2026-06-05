"use client";

import { useState } from "react";
import { usePortfolios } from "../../../hooks/use-portfolios";
import { useWorkflowStats } from "../../../hooks/use-workflows";
import { WorkflowRulesManager } from "../../../components/workflows/WorkflowRulesManager";

export default function SettingsPage(): React.ReactElement {
  const [portfolioId, setPortfolioId] = useState("");

  const portfoliosQuery = usePortfolios();
  const portfolios = portfoliosQuery.data?.data.items ?? [];
  const selectedPortfolioId = portfolioId || portfolios[0]?.id || "";

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Configuración
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Automatización por portafolio. El mensaje de cada regla se edita desde
          la propia regla.
        </p>
      </header>

      <label className="block max-w-sm text-sm font-medium">
        Portafolio
        <select
          className="mt-1 w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
          onChange={(e) => setPortfolioId(e.target.value)}
          value={selectedPortfolioId}
        >
          {portfolios.length === 0 ? (
            <option value="">Sin portafolios</option>
          ) : (
            portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))
          )}
        </select>
      </label>

      <StatsRow />

      <WorkflowRulesManager portfolioId={selectedPortfolioId} />
    </section>
  );
}

function StatsRow(): React.ReactElement {
  const statsQuery = useWorkflowStats();
  const stats = statsQuery.data?.data;
  if (!stats) return <></>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Contactos hoy" value={stats.contacts_today} />
      <StatCard label="Promesas activas" value={stats.active_promises} />
      <StatCard label="Escalamientos hoy" value={stats.escalations_today} />
      <StatCard label="Ejecuciones hoy" value={stats.executions_today} />
    </div>
  );
}

function StatCard({
  label,
  value
}: {
  label: string;
  value: number;
}): React.ReactElement {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </article>
  );
}
