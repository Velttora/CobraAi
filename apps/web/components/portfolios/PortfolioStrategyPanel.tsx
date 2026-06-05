"use client";

import { Package } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTemplates } from "../../hooks/use-notifications";
import {
  usePortfolio,
  useUpdatePortfolioStrategy
} from "../../hooks/use-portfolios";
import {
  useToggleWorkflowRule,
  useWorkflowPackages,
  type WorkflowRule,
  type WorkflowPackageSummary
} from "../../hooks/use-workflows";
import { sanitizeChannelText } from "../../lib/feature-flags";
import {
  describeWorkflowRule,
  partitionPortfolioRules
} from "../../lib/workflow-rules";
import { WorkflowPackageCard } from "../workflows/WorkflowPackageCard";
import { WorkflowRulesManager } from "../workflows/WorkflowRulesManager";
import { StrategyPill } from "./StrategyPill";

export function PortfolioStrategyPanel({
  portfolioId
}: {
  portfolioId: string;
}): React.ReactElement {
  const portfolioQuery = usePortfolio(portfolioId);
  const portfolio = portfolioQuery.data?.data;
  const updateStrategy = useUpdatePortfolioStrategy(portfolioId);
  const packagesQuery = useWorkflowPackages();
  const packages = packagesQuery.data?.data ?? [];
  const toggleRule = useToggleWorkflowRule(portfolioId);
  const templatesQuery = useTemplates();
  const templateById = useMemo(
    () => new Map((templatesQuery.data?.data.items ?? []).map((t) => [t.id, t])),
    [templatesQuery.data?.data.items]
  );
  const rules = (portfolio?.workflowRules ?? []) as WorkflowRule[];

  const [pendingStrategy, setPendingStrategy] = useState<"none" | "custom" | undefined>(undefined);
  const hasUnsavedStrategy =
    pendingStrategy !== undefined && pendingStrategy !== portfolio?.automationStatus;

  const { activeRules, inactiveRules } = partitionPortfolioRules(
    rules,
    portfolio?.automationStatus
  );

  async function applyPackage(
    packageSlug: string,
    overwrite = false
  ): Promise<void> {
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

  async function saveQuickStrategy(): Promise<void> {
    if (!pendingStrategy) return;
    try {
      const response = await updateStrategy.mutateAsync({ strategy: pendingStrategy });
      if (response.data.confirm_required) {
        toast.error("Confirma el reemplazo de reglas existentes");
        return;
      }
      setPendingStrategy(undefined);
      toast.success("Estrategia actualizada");
    } catch {
      toast.error("No se pudo actualizar la estrategia");
    }
  }

  return (
    <section className="space-y-6">
      <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Estrategia de automatización</h2>
            <p className="mt-1 text-xs text-slate-500">
              {portfolio?.name
                ? `Reglas scoped a ${portfolio.name}`
                : "Las reglas solo aplican a deudas de este portafolio."}
            </p>
          </div>
          <StrategyPill
            activePackageSlug={portfolio?.activePackageSlug}
            automationStatus={portfolio?.automationStatus}
          />
        </div>

        <StrategyQuickActions
          automationStatus={pendingStrategy ?? portfolio?.automationStatus}
          hasUnsaved={hasUnsavedStrategy}
          isSaving={updateStrategy.isPending}
          onCancel={() => setPendingStrategy(undefined)}
          onSave={() => void saveQuickStrategy()}
          onSelect={setPendingStrategy}
        />
      </article>

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
              Elige un paquete para este portafolio. Las reglas se crean con
              scope al portafolio y puedes editarlas después.
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
              <PortfolioPackageCardItem
                applyPackage={applyPackage}
                isApplying={updateStrategy.isPending}
                isActive={portfolio?.activePackageSlug === pkg.id}
                key={pkg.id}
                pkg={pkg}
              />
            ))}
          </div>
        )}
      </article>

      {portfolio?.automationStatus === "custom" ? (
        <WorkflowRulesManager portfolioId={portfolioId} />
      ) : (
        <>
          <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold">
              Reglas activas ({activeRules.length})
            </h3>
            <ul className="mt-3 space-y-2">
              {activeRules.length === 0 ? (
                <li className="text-sm text-slate-500">Sin reglas activas</li>
              ) : (
                activeRules.map((rule) => {
                  const { when, does, timing } = describeWorkflowRule(rule);
                  const hasTemplate = Boolean(rule.templateId && templateById.has(rule.templateId));
                  return (
                    <li
                      className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950"
                      key={rule.id}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{sanitizeChannelText(rule.name)}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {when} → {does}
                          {timing ? ` · ${timing}` : ""}
                        </span>
                        {rule.action === "send_notification" && (
                          hasTemplate ? (
                            <span className="mt-0.5 block text-xs font-medium text-emerald-600">
                              Mensaje configurado
                            </span>
                          ) : (
                            <Link
                              className="mt-0.5 block text-xs font-medium text-[#D85A30] hover:underline"
                              href="/settings"
                            >
                              Sin mensaje · configurar
                            </Link>
                          )
                        )}
                      </span>
                      <button
                        className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800"
                        onClick={() =>
                          toggleRule.mutate({ id: rule.id, isActive: false })
                        }
                        type="button"
                      >
                        Activa
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </article>

          {inactiveRules.length > 0 ? (
            <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Reglas inactivas ({inactiveRules.length})
              </h3>
              <ul className="mt-3 space-y-2">
                {inactiveRules.map((rule) => {
                  const { when, does, timing } = describeWorkflowRule(rule);
                  const hasTemplate = Boolean(rule.templateId && templateById.has(rule.templateId));
                  return (
                    <li
                      className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950"
                      key={rule.id}
                    >
                      <span className="min-w-0 text-slate-500">
                        <span className="block font-medium">{sanitizeChannelText(rule.name)}</span>
                        <span className="mt-0.5 block text-xs">
                          {when} → {does}
                          {timing ? ` · ${timing}` : ""}
                        </span>
                        {rule.action === "send_notification" && (
                          hasTemplate ? (
                            <span className="mt-0.5 block text-xs font-medium text-emerald-600">
                              Mensaje configurado
                            </span>
                          ) : (
                            <Link
                              className="mt-0.5 block text-xs font-medium text-[#D85A30] hover:underline"
                              href="/settings"
                            >
                              Sin mensaje · configurar
                            </Link>
                          )
                        )}
                      </span>
                      <button
                        className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600"
                        onClick={() =>
                          toggleRule.mutate({ id: rule.id, isActive: true })
                        }
                        type="button"
                      >
                        Inactiva
                      </button>
                    </li>
                  );
                })}
              </ul>
            </article>
          ) : null}
        </>
      )}

      {portfolio?.packageApplications && portfolio.packageApplications.length > 0 ? (
        <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold">Historial de estrategia</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            {portfolio.packageApplications.map((entry) => (
              <li key={entry.id}>
                {entry.action}
                {entry.packageSlug ? ` · ${entry.packageSlug}` : ""} ·{" "}
                {new Date(entry.createdAt).toLocaleString("es-CO")}
              </li>
            ))}
          </ul>
        </article>
      ) : null}
    </section>
  );
}

function StrategyQuickActions({
  automationStatus,
  hasUnsaved,
  isSaving,
  onSelect,
  onSave,
  onCancel
}: {
  automationStatus?: string;
  hasUnsaved: boolean;
  isSaving: boolean;
  onSelect: (strategy: "none" | "custom") => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded-lg border px-3 py-2 text-sm ${
            automationStatus === "none"
              ? "border-[#D85A30] bg-[#D85A30]/5"
              : "border-slate-200 dark:border-slate-700"
          }`}
          onClick={() => onSelect("none")}
          type="button"
        >
          Sin automatización
        </button>
        <Link
          className={`rounded-lg border px-3 py-2 text-sm ${
            automationStatus === "custom"
              ? "border-[#D85A30] bg-[#D85A30]/5"
              : "border-slate-200 dark:border-slate-700"
          }`}
          href="/settings"
        >
          Reglas personalizadas
        </Link>
      </div>
    </div>
  );
}

function PortfolioPackageCardItem({
  pkg,
  isActive,
  isApplying,
  applyPackage
}: {
  pkg: WorkflowPackageSummary;
  isActive: boolean;
  isApplying: boolean;
  applyPackage: (packageSlug: string, overwrite: boolean) => Promise<void>;
}) {
  return (
    <WorkflowPackageCard
      applyLabel="Aplicar a este portafolio"
      confirmMessage="Este portafolio ya tiene reglas activas. ¿Reemplazarlas con este paquete?"
      isActive={isActive}
      isApplying={isApplying}
      onApply={(overwrite) => applyPackage(pkg.id, overwrite)}
      pkg={pkg}
    />
  );
}
