"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { CreateDebtModal } from "../../../../components/debts/CreateDebtModal";
import { PortfolioDebtTable } from "../../../../components/portfolios/PortfolioDebtTable";
import { useDebts } from "../../../../hooks/use-debts";
import {
  usePortfolio,
  usePortfolioStats
} from "../../../../hooks/use-portfolios";
import { formatCurrency } from "../../../../lib/formatters";
import type { PortfolioQuarterStat } from "../../../../lib/types";
import { toNumber } from "../../../../lib/types";

export default function PortfolioDetailPage({
  params
}: {
  params: { id: string };
}): React.ReactElement {
  const [activeQuarter, setActiveQuarter] = useState<string | null>(null);
  const portfolioQuery = usePortfolio(params.id);
  const statsQuery = usePortfolioStats(params.id);
  const debtsQuery = useDebts({
    portfolioId: params.id,
    includeFuture: true,
    page: 1,
    limit: 50,
    collectionQuarter: activeQuarter ?? undefined
  });

  const portfolio = portfolioQuery.data?.data;
  const quarters = (statsQuery.data?.data.quarters ??
    []) as PortfolioQuarterStat[];
  const debts = debtsQuery.data?.data.items ?? [];

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
            <p className="mt-1 text-sm text-slate-500">
              {portfolio.totalDebts} deudas ·{" "}
              {formatCurrency(toNumber(portfolio.totalAmount), portfolio.currency)}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <CreateDebtModal portfolioId={params.id} />
          <Link
            className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29]"
            href={`/portfolios/${params.id}/import` as Route}
          >
            Importar archivo
          </Link>
        </div>
      </header>

      <PortfolioDebtTable
        activeQuarter={activeQuarter}
        currency={portfolio?.currency ?? "COP"}
        debts={debts}
        loading={debtsQuery.isLoading || statsQuery.isLoading}
        onQuarterChange={setActiveQuarter}
        quarters={quarters}
      />
    </section>
  );
}
