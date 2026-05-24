"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertFeed } from "../../components/dashboard/AlertFeed";
import { DebtTable } from "../../components/dashboard/DebtTable";
import { KPICard } from "../../components/dashboard/KPICard";
import { RecoveryChart } from "../../components/dashboard/RecoveryChart";
import { SegmentDonut } from "../../components/dashboard/SegmentDonut";
import { useDebts } from "../../hooks/use-debts";
import {
  computeDashboardMetrics,
  formatMetricAmount,
  formatMetricDso,
  formatMetricRecoveryRate
} from "../../lib/dashboard-metrics";

export function DashboardView() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("ai_score:desc");

  const tableQuery = useDebts({ page, limit: 10, sort });
  const metricsQuery = useDebts({ page: 1, limit: 100, sort: "ai_score:desc" });

  const tableDebts = tableQuery.data?.data.items ?? [];
  const allDebts = metricsQuery.data?.data.items ?? [];
  const metrics = useMemo(() => computeDashboardMetrics(allDebts), [allDebts]);

  const loading = tableQuery.isLoading || metricsQuery.isLoading;
  const error = tableQuery.error ?? metricsQuery.error;

  useEffect(() => {
    if (error) {
      toast.error("No se pudieron cargar los datos del dashboard");
    }
  }, [error]);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Vista ejecutiva de cartera y riesgo
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          hint="vs. mes anterior (estimado)"
          label="Tasa de recuperación"
          loading={loading}
          trend={{ value: "+2.1%", positive: true }}
          value={formatMetricRecoveryRate(metrics.recoveryRate)}
        />
        <KPICard
          hint="Meta mensual $50M"
          label="Monto recuperado"
          loading={loading}
          trend={{ value: "68% meta", positive: true }}
          value={formatMetricAmount(metrics.recoveredAmount, metrics.currency)}
        />
        <KPICard
          hint="Benchmark industria: 45 días"
          label="DSO promedio"
          loading={loading}
          trend={{
            value: metrics.dsoAverage > 45 ? "+ sobre meta" : "En meta",
            positive: metrics.dsoAverage <= 45
          }}
          value={formatMetricDso(metrics.dsoAverage)}
        />
        <KPICard
          alert={metrics.highRiskCount > 0}
          hint={`${metrics.highRiskCount} en riesgo alto/crítico`}
          label="Cuentas activas"
          loading={loading}
          value={String(metrics.activeAccounts)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <RecoveryChart debts={allDebts} loading={metricsQuery.isLoading} />
          <DebtTable
            debts={tableDebts}
            loading={tableQuery.isLoading}
            onPageChange={setPage}
            onSortChange={setSort}
            pagination={tableQuery.data?.data.pagination}
            sort={sort}
          />
        </div>
        <aside className="space-y-6">
          <SegmentDonut debts={allDebts} loading={metricsQuery.isLoading} />
          <AlertFeed debts={allDebts} loading={metricsQuery.isLoading} />
        </aside>
      </div>
    </section>
  );
}
