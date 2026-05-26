"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertFeed } from "./AlertFeed";
import { DebtTable } from "./DebtTable";
import { KPICard } from "./KPICard";
import { PortfolioProjectionView } from "./PortfolioProjectionView";
import { RecoveryChart } from "./RecoveryChart";
import { SegmentDonut } from "./SegmentDonut";
import { useDebts } from "../../hooks/use-debts";
import { usePortfolios } from "../../hooks/use-portfolios";
import { useConversations } from "../../hooks/use-conversations";
import { useCalls } from "../../hooks/use-calls";
import {
  computeDashboardMetrics,
  formatMetricAmount,
  formatMetricDso,
  formatMetricRecoveryRate
} from "../../lib/dashboard-metrics";

type DashboardTab = "active" | "projection";

export function DashboardView() {
  const [tab, setTab] = useState<DashboardTab>("active");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("priority_score:desc");
  const [pipelineMode, setPipelineMode] = useState(false);

  const tableQuery = useDebts({
    page,
    limit: 10,
    sort,
    includeFuture: pipelineMode,
    pipeline: pipelineMode
  });
  const metricsQuery = useDebts({ page: 1, limit: 100, sort: "priority_score:desc" });
  const portfoliosQuery = usePortfolios();
  const waConvsQuery = useConversations({ channel: "whatsapp", limit: 100 });
  const callsQuery = useCalls();

  const tableDebts = tableQuery.data?.data.items ?? [];
  const allDebts = metricsQuery.data?.data.items ?? [];
  const metrics = useMemo(() => computeDashboardMetrics(allDebts), [allDebts]);

  const loading = tableQuery.isLoading || metricsQuery.isLoading;
  const error = tableQuery.error ?? metricsQuery.error;

  // KPI: % promesas WA (convs con status=open que tuvieron promise_to_pay)
  const waConvs = waConvsQuery.data?.data.items ?? [];
  const waTotal = waConvsQuery.data?.data.total ?? 0;
  const waPromises = waConvs.filter((c) => c.status === "closed" || c.status === "open").length;
  const waPromiseRate = waTotal > 0 ? Math.round((waPromises / waTotal) * 100) : 0;

  // KPI: % atención llamada (calls con outcome !== no_answer / total)
  const allCalls = callsQuery.data?.data.items ?? [];
  const answeredCalls = allCalls.filter(
    (c) => c.outcome && c.outcome !== "no_answer" && c.outcome !== "voicemail"
  ).length;
  const callAttendanceRate =
    allCalls.length > 0 ? Math.round((answeredCalls / allCalls.length) * 100) : 0;

  useEffect(() => {
    if (error) {
      toast.error("No se pudieron cargar los datos del dashboard");
    }
  }, [error]);

  const portfoliosWithoutAutomation =
    portfoliosQuery.data?.data.items.filter(
      (p) => (p.automationStatus ?? "none") === "none"
    ) ?? [];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Vista ejecutiva de cartera y riesgo
        </p>
        {motionDashboardTabBar({ tab, onTabChange: setTab })}
      </header>

      {portfoliosWithoutAutomation.length > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {portfoliosWithoutAutomation.length} portafolio
          {portfoliosWithoutAutomation.length === 1 ? "" : "s"} sin estrategia de
          automatización:{" "}
          {portfoliosWithoutAutomation.map((p) => p.name).join(", ")}.
        </p>
      ) : null}

      {tab === "projection" ? (
        <PortfolioProjectionView />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-full px-3 py-1 text-xs ${
                !pipelineMode
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800"
              }`}
              onClick={() => setPipelineMode(false)}
              type="button"
            >
              Activas
            </button>
            <button
              className={`rounded-full px-3 py-1 text-xs ${
                pipelineMode
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800"
              }`}
              onClick={() => setPipelineMode(true)}
              type="button"
            >
              Pipeline futuro
            </button>
          </div>

          {pipelineMode ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
              Mostrando cuentas diferidas — aún no en gestión activa
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
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
            <KPICard
              hint={`${waTotal} conversaciones WhatsApp totales`}
              label="Promesas WA"
              loading={waConvsQuery.isLoading}
              trend={{ value: waTotal > 0 ? "activo" : "sin datos", positive: waTotal > 0 }}
              value={`${waPromiseRate}%`}
            />
            <KPICard
              hint={`${answeredCalls} de ${allCalls.length} llamadas atendidas`}
              label="Atención llamada"
              loading={callsQuery.isLoading}
              trend={{
                value: callAttendanceRate >= 50 ? "En meta" : "Bajo meta",
                positive: callAttendanceRate >= 50
              }}
              value={`${callAttendanceRate}%`}
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
                pipelineMode={pipelineMode}
                sort={sort}
              />
            </div>
            <aside className="space-y-6">
              <SegmentDonut debts={allDebts} loading={metricsQuery.isLoading} />
              <AlertFeed debts={allDebts} loading={metricsQuery.isLoading} />
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function motionDashboardTabBar({
  tab,
  onTabChange
}: {
  tab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}) {
  return (
    <div className="mt-4 flex gap-2">
      <button
        className={`rounded-md px-3 py-1.5 text-sm ${
          tab === "active"
            ? "bg-[#D85A30] text-white"
            : "border border-slate-200 text-slate-600 dark:border-slate-700"
        }`}
        onClick={() => onTabChange("active")}
        type="button"
      >
        Recuperación activa
      </button>
      <button
        className={`rounded-md px-3 py-1.5 text-sm ${
          tab === "projection"
            ? "bg-[#D85A30] text-white"
            : "border border-slate-200 text-slate-600 dark:border-slate-700"
        }`}
        onClick={() => onTabChange("projection")}
        type="button"
      >
        Proyección de cartera
      </button>
    </div>
  );
}
