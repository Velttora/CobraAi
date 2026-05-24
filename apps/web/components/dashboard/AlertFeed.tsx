"use client";

import type { Route } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "../../lib/formatters";
import type { Debt } from "../../lib/types";
import { toNumber } from "../../lib/types";
import { Skeleton } from "../shared/Skeleton";

export function AlertFeed({
  debts,
  loading
}: {
  debts: Debt[];
  loading?: boolean;
}) {
  const alerts = debts
    .filter(
      (d) =>
        (d.aiSegment === "critical" || d.aiSegment === "high") &&
        d.status !== "paid" &&
        d.status !== "written_off"
    )
    .slice(0, 5);

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Alertas de riesgo
      </h2>
      <ul className="mt-3 space-y-3">
        {alerts.length === 0 ? (
          <li className="text-sm text-slate-500">No hay alertas activas</li>
        ) : (
          alerts.map((debt) => (
            <li key={debt.id}>
              <Link
                className="flex items-start gap-2 rounded-md p-2 transition hover:bg-slate-50 dark:hover:bg-slate-800"
                href={`/debts/${debt.id}` as Route}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#A32D2D]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {debt.debtor?.name ?? "Deudor"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatCurrency(toNumber(debt.amountOutstanding), debt.currency)}{" "}
                    · score {debt.aiScore ?? "—"}
                  </span>
                </span>
              </Link>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
