"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCommitmentSummary } from "../../hooks/use-negotiations";
import { buildCommitmentKpis } from "../../lib/commitment-kpis";
import { cn } from "../../lib/utils";
import { KPICard } from "./KPICard";

/**
 * Bloque de promesas y acuerdos del dashboard. Cada tarjeta abre la bandeja ya
 * filtrada: un KPI que obliga a volver a filtrar a mano es un KPI que se mira
 * y no se atiende.
 */
export function CommitmentKpis(): React.ReactElement | null {
  const router = useRouter();
  const query = useCommitmentSummary();
  const summary = query.data?.data;

  // Sin un solo compromiso registrado, cuatro tarjetas en cero solo ocupan
  // espacio: el bloque aparece cuando hay algo que contar.
  if (!query.isLoading && (!summary || summary.total === 0)) {
    return null;
  }

  const kpis = summary ? buildCommitmentKpis(summary) : [];

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          Promesas y acuerdos
        </h2>
        <Link
          className="text-xs font-medium text-[#D85A30] transition hover:underline"
          href={"/negotiations" as Route}
        >
          Ver todos
        </Link>
      </div>
      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2",
          kpis.length > 4 ? "xl:grid-cols-5" : "xl:grid-cols-4"
        )}
      >
        {query.isLoading
          ? Array.from({ length: 4 }, (_, i) => (
              <KPICard key={i} label="" loading value="" />
            ))
          : kpis.map((kpi) => (
              <KPICard
                alert={kpi.alert}
                hint={kpi.hint}
                key={kpi.key}
                label={kpi.label}
                onClick={() =>
                  router.push(`/negotiations?status=${kpi.status}` as Route)
                }
                trend={kpi.trend}
                value={kpi.value}
              />
            ))}
      </div>
    </div>
  );
}
