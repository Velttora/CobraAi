"use client";

import { Package } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { usePortfolio, usePortfolios, useUpdatePortfolioStrategy } from "../../../hooks/use-portfolios";
import { useWorkflowPackages } from "../../../hooks/use-workflows";
import { useWorkflowStats } from "../../../hooks/use-workflows";
import { WorkflowPackageCard } from "../../../components/workflows/WorkflowPackageCard";
import { WorkflowRulesManager } from "../../../components/workflows/WorkflowRulesManager";

export default function SettingsPage(): React.ReactElement {
  const [portfolioId, setPortfolioId] = useState("");

  const portfoliosQuery = usePortfolios();
  const portfolios = portfoliosQuery.data?.data.items ?? [];
  const selectedPortfolioId = portfolioId || portfolios[0]?.id || "";

  const portfolioQuery = usePortfolio(selectedPortfolioId);
  const portfolio = portfolioQuery.data?.data;
  const updateStrategy = useUpdatePortfolioStrategy(selectedPortfolioId);
  const packagesQuery = useWorkflowPackages();
  const packages = packagesQuery.data?.data ?? [];

  async function applyPackage(packageSlug: string, overwrite = false): Promise<void> {
    const response = await updateStrategy.mutateAsync({
      strategy: "package",
      package_slug: packageSlug,
      overwrite
    });
    if (response.data.confirm_required) {
      throw new Error("confirm_required");
    }
    toast.success("Paquete aplicado al portafolio");
  }

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

      <article className="rounded-xl border border-[#D85A30]/30 bg-gradient-to-br from-orange-50/80 to-white p-5 dark:border-[#D85A30]/40 dark:from-slate-900 dark:to-slate-950">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#D85A30]/10 text-[#D85A30]">
            <Package className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Paquetes de estrategia
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Elige un paquete para el portafolio seleccionado. Las reglas se
              crean con scope al portafolio y puedes editarlas después.
            </p>
          </div>
        </div>

        {packagesQuery.isError ? (
          <p className="mt-4 text-sm text-[#A32D2D]">
            No se pudieron cargar los paquetes. Verifica que service-workflows
            esté en ejecución.
          </p>
        ) : packages.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Cargando paquetes…</p>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {packages.map((pkg) => (
              <WorkflowPackageCard
                applyLabel="Aplicar a este portafolio"
                confirmMessage="Este portafolio ya tiene reglas activas. ¿Reemplazarlas con este paquete?"
                isActive={portfolio?.activePackageSlug === pkg.id}
                isApplying={updateStrategy.isPending}
                key={pkg.id}
                onApply={(overwrite) => applyPackage(pkg.id, overwrite)}
                pkg={pkg}
              />
            ))}
          </div>
        )}
      </article>

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
