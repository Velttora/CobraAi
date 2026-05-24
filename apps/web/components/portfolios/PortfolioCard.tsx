"use client";

import type { Route } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { formatCurrency } from "../../lib/formatters";
import type { Portfolio } from "../../lib/types";
import { toNumber } from "../../lib/types";

export function PortfolioCard({ portfolio }: { portfolio: Portfolio }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-[#D85A30]/40 dark:border-slate-800 dark:bg-slate-900">
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
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {portfolio.status}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Deudas</dt>
          <dd className="font-medium">{portfolio.totalDebts}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Monto</dt>
          <dd className="font-medium">
            {formatCurrency(toNumber(portfolio.totalAmount), portfolio.currency)}
          </dd>
        </div>
      </dl>
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
    </article>
  );
}
