"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { CreateDebtModal } from "../../../../components/debts/CreateDebtModal";
import { DeletePortfolioModal } from "../../../../components/portfolios/DeletePortfolioModal";
import { PortfolioDebtTable } from "../../../../components/portfolios/PortfolioDebtTable";
import { PortfolioStrategyPanel } from "../../../../components/portfolios/PortfolioStrategyPanel";
import { StrategyPill } from "../../../../components/portfolios/StrategyPill";
import { useDebts } from "../../../../hooks/use-debts";
import {
  usePortfolio,
  usePortfolioStats
} from "../../../../hooks/use-portfolios";
import { formatCurrency } from "../../../../lib/formatters";
import type { PortfolioQuarterStat } from "../../../../lib/types";
import { toNumber } from "../../../../lib/types";

type DetailTab = "debts" | "automation";

const PAGE_SIZE = 100;

export default function PortfolioDetailPage({
  params
}: {
  params: { id: string };
}): React.ReactElement {
  const [activeQuarter, setActiveQuarter] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("debts");
  const [page, setPage] = useState(1);

  const portfolioQuery = usePortfolio(params.id);
  const statsQuery = usePortfolioStats(params.id);
  const debtsQuery = useDebts({
    portfolioId: params.id,
    includeFuture: true,
    page,
    limit: PAGE_SIZE,
    collectionQuarter: activeQuarter ?? undefined
  });

  const portfolio = portfolioQuery.data?.data;
  const quarters = (statsQuery.data?.data.quarters ??
    []) as PortfolioQuarterStat[];
  const debts = debtsQuery.data?.data.items ?? [];
  const pagination = debtsQuery.data?.data.pagination;

  function handleQuarterChange(quarter: string | null): void {
    setActiveQuarter(quarter);
    setPage(1);
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="text-sm text-[#D85A30] hover:underline"
            href={"/portfolios" as Route}
          >
            ← Portafolios
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            {portfolio?.name ?? "Portafolio"}
          </h1>
          {portfolio ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-500">
                {portfolio.totalDebts} deudas ·{" "}
                {formatCurrency(toNumber(portfolio.totalAmount), portfolio.currency)}
              </p>
              <StrategyPill
                activePackageSlug={portfolio.activePackageSlug}
                automationStatus={portfolio.automationStatus}
              />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <CreateDebtModal portfolioId={params.id} />
          <Link
            className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29]"
            href={`/portfolios/${params.id}/import` as Route}
          >
            Importar archivo
          </Link>
          {portfolio ? <DeletePortfolioModal portfolio={portfolio} /> : null}
        </div>
      </header>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          className={`border-b-2 px-3 py-2 text-sm ${
            tab === "debts"
              ? "border-[#D85A30] font-medium text-[#D85A30]"
              : "border-transparent text-slate-500"
          }`}
          onClick={() => setTab("debts")}
          type="button"
        >
          Deudas
        </button>
        <button
          className={`border-b-2 px-3 py-2 text-sm ${
            tab === "automation"
              ? "border-[#D85A30] font-medium text-[#D85A30]"
              : "border-transparent text-slate-500"
          }`}
          onClick={() => setTab("automation")}
          type="button"
        >
          Automatización
        </button>
      </div>

      {tab === "automation" ? (
        <PortfolioStrategyPanel portfolioId={params.id} />
      ) : (
        <PortfolioDebtTable
          activeQuarter={activeQuarter}
          currency={portfolio?.currency ?? "COP"}
          debts={debts}
          loading={debtsQuery.isLoading || statsQuery.isLoading}
          onPageChange={setPage}
          onQuarterChange={handleQuarterChange}
          page={pagination?.page ?? 1}
          quarters={quarters}
          totalDebts={pagination?.total}
          totalPages={pagination?.total_pages}
        />
      )}
    </section>
  );
}
