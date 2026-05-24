"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Package } from "lucide-react";
import {
  formatWorkflowChannel,
  useApplyWorkflowPackage,
  useWorkflowPackage,
  useWorkflowPackages,
  WorkflowPackageConflictError,
  type WorkflowPackageSummary
} from "../../hooks/use-workflows";
import { cn } from "../../lib/utils";

export function WorkflowPackagePicker({ hasRules }: { hasRules: boolean }) {
  const packagesQuery = useWorkflowPackages();

  return (
    <article className="rounded-xl border border-[#D85A30]/30 bg-gradient-to-br from-orange-50/80 to-white p-5 dark:border-[#D85A30]/40 dark:from-slate-900 dark:to-slate-950">
      <PackagePickerIntro hasRules={hasRules} />
      <PackagePickerGrid packages={packagesQuery.data?.data ?? []} />
    </article>
  );
}

function PackagePickerIntro({
  hasRules
}: {
  hasRules: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#D85A30]/10 text-[#D85A30]">
        <Package className="h-5 w-5" />
      </span>
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {hasRules
            ? "Paquetes de estrategia"
            : "¿Por dónde empezar? Elige un paquete"}
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Estrategias de cobranza pre-configuradas. Al aplicarlas se crean reglas
          editables en tu tenant — puedes modificarlas cuando quieras.
        </p>
      </div>
    </div>
  );
}

function PackagePickerGrid({
  packages
}: {
  packages: WorkflowPackageSummary[];
}) {
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-3">
      {packages.map((pkg) => (
        <WorkflowPackageCard key={pkg.id} pkg={pkg} />
      ))}
    </div>
  );
}

function WorkflowPackageCard({ pkg }: { pkg: WorkflowPackageSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const detailQuery = useWorkflowPackage(pkg.id, expanded);
  const applyPackage = useApplyWorkflowPackage();

  async function handleApply(overwrite = false): Promise<void> {
    try {
      await applyPackage.mutateAsync({ packageId: pkg.id, overwrite });
      setConfirmReplace(false);
    } catch (error) {
      if (error instanceof WorkflowPackageConflictError) {
        setConfirmReplace(true);
      }
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100">
        {pkg.name}
      </h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {pkg.description}
      </p>
      <p className="mt-2 text-xs text-slate-500">{pkg.profile}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {pkg.rules_count} reglas
        </span>
        {pkg.channels.map((channel) => (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs capitalize",
              channel === "voice"
                ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            )}
            key={channel}
          >
            {formatWorkflowChannel(channel)}
          </span>
        ))}
      </div>

      <button
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#D85A30] hover:underline"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        {expanded ? (
          <>
            Ocultar reglas <ChevronUp className="h-3.5 w-3.5" />
          </>
        ) : (
          <>
            Ver reglas incluidas <ChevronDown className="h-3.5 w-3.5" />
          </>
        )}
      </button>

      {expanded && detailQuery.data?.data ? (
        <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
          {detailQuery.data.data.rules.map((rule) => (
            <li className="text-slate-600 dark:text-slate-400" key={rule.name}>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {rule.name}
              </span>
              <span className="block">
                {rule.trigger} → {rule.action}
                {rule.channel
                  ? ` · ${formatWorkflowChannel(rule.channel)}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {confirmReplace ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p>
            Este paquete ya fue aplicado antes. ¿Reemplazar las reglas
            anteriores de este paquete?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-md bg-[#D85A30] px-2 py-1 text-white hover:bg-[#c24f29] disabled:opacity-60"
              disabled={applyPackage.isPending}
              onClick={() => void handleApply(true)}
              type="button"
            >
              Sí, reemplazar
            </button>
            <button
              className="rounded-md border border-amber-300 px-2 py-1 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900"
              onClick={() => setConfirmReplace(false)}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          className="mt-4 rounded-md bg-[#D85A30] px-3 py-2 text-sm font-medium text-white hover:bg-[#c24f29] disabled:opacity-60"
          disabled={applyPackage.isPending}
          onClick={() => void handleApply(false)}
          type="button"
        >
          {applyPackage.isPending ? "Aplicando..." : "Aplicar paquete"}
        </button>
      )}
    </div>
  );
}
