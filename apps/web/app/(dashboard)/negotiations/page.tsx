"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CommitmentSummaryBar } from "../../../components/negotiations/CommitmentSummaryBar";
import { NegotiationCard } from "../../../components/negotiations/NegotiationCard";
import { useDebounce } from "../../../hooks/use-debounce";
import {
  useCommitmentSummary,
  useNegotiations
} from "../../../hooks/use-negotiations";
import { usePortfolios } from "../../../hooks/use-portfolios";
import {
  emptyMessage,
  parseStatusParam,
  sortCommitments,
  SORT_OPTIONS,
  STATUS_FILTERS,
  TYPE_FILTERS,
  type CommitmentSort,
  type CommitmentStatusFilter,
  type CommitmentTypeFilter
} from "../../../lib/commitment-filters";
import { cn } from "../../../lib/utils";

const SELECT_CLASS =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900";

function chipClass(active: boolean, tone: "primary" | "secondary"): string {
  if (active) {
    return tone === "primary"
      ? "bg-[#D85A30] font-medium text-white"
      : "bg-slate-900 font-medium text-white dark:bg-slate-100 dark:text-slate-900";
  }
  return "border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";
}

export default function NegotiationsPage(): React.ReactElement {
  // Los KPI del dashboard entran aquí con el filtro puesto; sin esto, tocar
  // "Vencido sin pagar" dejaría al usuario buscándolo otra vez a mano.
  const searchParams = useSearchParams();
  // Abre en "Todas": la pregunta que trae aquí al cliente es qué ha pasado con
  // sus deudores, no solo qué está en mora. El orden ya pone lo urgente arriba.
  const [status, setStatus] = useState<CommitmentStatusFilter>(() =>
    parseStatusParam(searchParams.get("status"))
  );
  const [type, setType] = useState<CommitmentTypeFilter>("all");
  const [portfolioId, setPortfolioId] = useState("");
  const [sort, setSort] = useState<CommitmentSort>("urgency");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);

  const portfolios = usePortfolios();
  const scope = {
    type: type === "all" ? undefined : type,
    portfolio_id: portfolioId || undefined,
    search: debouncedSearch.trim() || undefined
  };

  const query = useNegotiations({
    ...scope,
    status: status === "all" ? undefined : status,
    limit: 200
  });
  const summary = useCommitmentSummary(scope);

  const items = useMemo(
    () => sortCommitments(query.data?.data ?? [], sort),
    [query.data?.data, sort]
  );

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Promesas y acuerdos de pago
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Todo lo que los deudores se comprometieron a pagar — promesas y planes
          en cuotas — con su estado real, lo que ya abonaron y la última
          conversación donde se pactó.
        </p>
      </header>

      {summary.data && (
        <CommitmentSummaryBar
          onSelect={setStatus}
          summary={summary.data.data}
        />
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition",
                chipClass(status === f.value, "primary")
              )}
              key={f.value}
              onClick={() => setStatus(f.value)}
              type="button"
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {TYPE_FILTERS.map((f) => (
            <button
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition",
                chipClass(type === f.value, "secondary")
              )}
              key={f.value}
              onClick={() => setType(f.value)}
              type="button"
            >
              {f.label}
            </button>
          ))}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              aria-label="Buscar por deudor o cuenta"
              className={cn(SELECT_CLASS, "w-56")}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar deudor o cuenta…"
              type="search"
              value={search}
            />
            <select
              aria-label="Filtrar por portafolio"
              className={SELECT_CLASS}
              onChange={(e) => setPortfolioId(e.target.value)}
              value={portfolioId}
            >
              <option value="">Todos los portafolios</option>
              {(portfolios.data?.data.items ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Ordenar compromisos"
              className={SELECT_CLASS}
              onChange={(e) => setSort(e.target.value as CommitmentSort)}
              value={sort}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : query.isError ? (
        <p className="text-sm text-[#A32D2D]">
          No se pudieron cargar las promesas y acuerdos.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          {emptyMessage(status, type, Boolean(debouncedSearch.trim()))}
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <NegotiationCard commitment={item} key={item.id} />
          ))}
        </div>
      )}
    </section>
  );
}
