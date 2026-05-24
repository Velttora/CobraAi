"use client";

import type { Route } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { formatCurrency } from "../../lib/formatters";
import { getQuarterLabel } from "../../lib/quarters";
import { usePortfolioStats } from "../../hooks/use-portfolios";
import type { Portfolio, PortfolioQuarterStat } from "../../lib/types";
import {
  PortfolioAutomationBanner,
  StrategyPill
} from "./PortfolioAutomationBanner";

function QuarterBadge({ status }: { status: PortfolioQuarterStat["status"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#D85A30]">
        <span className="h-2 w-2 rounded-full bg-[#D85A30]" />
        Activo
      </span>
    );
  }
  if (status === "upcoming") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#EF9F27]">
        <span className="h-2 w-2 rounded-full bg-[#EF9F27]" />
        Próximo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
      <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
      Futuro
    </span>
  );
}

export function PortfolioCard({ portfolio }: { portfolio: Portfolio }) {
  const statsQuery = usePortfolioStats(portfolio.id);
  const stats = statsQuery.data?.data;
  const quarters = (stats?.quarters ?? []) as PortfolioQuarterStat[];
  const showPipeline = quarters.some(
    (q) => q.status === "upcoming" || q.status === "future"
  );
  const recoveryRate = Math.round(Number(stats?.recovery_rate ?? 0) * 100);
  const totalPortfolio = Number(
    stats?.total_portfolio_amount ?? portfolio.totalAmount
  );

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-[#D85A30]/40 dark:border-slate-800 dark:bg-slate-900">
      <CardTitle portfolio={portfolio} />

      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        {formatCurrency(totalPortfolio, portfolio.currency)} total ·{" "}
        {stats?.total_portfolio_debts ?? portfolio.totalDebts} cuentas
        {portfolio.rulesCount != null ? ` · ${portfolio.rulesCount} reglas` : ""}
      </p>

      <RecoveryBar recoveryRate={recoveryRate} />

      {statsQuery.isLoading ? (
        <LoadingSkeleton />
      ) : showPipeline ? (
        <PipelineSection currency={portfolio.currency} quarters={quarters} />
      ) : null}

      <PortfolioAutomationBanner automationStatus={portfolio.automationStatus} />

      <CardActions portfolio={portfolio} />
    </article>
  );
}

function CardTitle({ portfolio }: { portfolio: Portfolio }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">
          {portfolio.name}
        </h3>
        {portfolio.description ? (
          <p className="mt-1 text-sm text-slate-500 line-clamp-2">
            {portfolio.description}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {portfolio.status}
        </span>
        <StrategyPill
          activePackageSlug={portfolio.activePackageSlug}
          automationStatus={portfolio.automationStatus}
        />
      </div>
    </div>
  );
}

function RecoveryBar({ recoveryRate }: { recoveryRate: number }) {
  return (
    <div className="mt-3">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-[#D85A30]"
          style={{ width: `${Math.min(100, recoveryRate)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {recoveryRate}% recuperado (solo cuentas activas)
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
      <div className="h-3 w-36 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      {motionSkeletonRowSecond()}
    </div>
  );
}

function motionSkeletonRowSecond() {
  return (
    <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
  );
}

function PipelineSection({
  quarters,
  currency
}: {
  quarters: PortfolioQuarterStat[];
  currency: string;
}) {
  return (
    <section className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Pipeline por trimestre
      </h4>
      <ul className="mt-2 space-y-2">
        {quarters.map((q) => (
          <li
            className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm"
            key={q.quarter}
          >
            <span className="text-slate-700 dark:text-slate-200">
              {q.quarter.replace("-", " · ")} · {getQuarterLabel(q.quarter)}
            </span>
            <QuarterBadge status={q.status} />
            <span className="col-span-2 text-slate-500">
              {formatCurrency(q.amount, currency)} · {q.debts_count} ctas
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CardActions({ portfolio }: { portfolio: Portfolio }) {
  return (
    <div className="mt-4 flex gap-2">
      <Link
        className="rounded-md bg-[#D85A30] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#c24f29]"
        href={`/portfolios/${portfolio.id}` as Route}
      >
        Ver detalle
      </Link>
      <Link
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        href={`/portfolios/${portfolio.id}/import` as Route}
      >
        <Upload className="h-3.5 w-3.5" />
        Importar
      </Link>
    </div>
  );
}
