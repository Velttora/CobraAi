"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  formatWorkflowChannel,
  useWorkflowPackage,
  type WorkflowPackageSummary
} from "../../hooks/use-workflows";
import {
  resolveMessageChannel,
  sanitizeChannelText
} from "../../lib/feature-flags";
import { cn } from "../../lib/utils";
import {
  describeWorkflowRule,
  sortRulesByDebtorLifecycle
} from "../../lib/workflow-rules";

export type WorkflowPackageCardProps = {
  pkg: WorkflowPackageSummary;
  isActive?: boolean;
  isApplying?: boolean;
  applyLabel?: string;
  confirmMessage?: string;
  onApply: (overwrite: boolean) => Promise<void>;
};

export function WorkflowPackageCard({
  pkg,
  isActive = false,
  isApplying = false,
  applyLabel = "Aplicar paquete",
  confirmMessage = "Ya hay reglas activas. ¿Reemplazarlas con este paquete?",
  onApply
}: WorkflowPackageCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const detailQuery = useWorkflowPackage(pkg.id, expanded);
  const packageRules = useMemo(
    () =>
      sortRulesByDebtorLifecycle(detailQuery.data?.data.rules ?? []),
    [detailQuery.data?.data.rules]
  );

  async function handleApply(overwrite = false): Promise<void> {
    try {
      await onApply(overwrite);
      setConfirmReplace(false);
    } catch {
      setConfirmReplace(true);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-white p-4 dark:bg-slate-900",
        isActive
          ? "border-[#D85A30] ring-1 ring-[#D85A30]/30"
          : "border-slate-200 dark:border-slate-800"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">
          {pkg.name}
        </h3>
        {isActive ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            Activo
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {pkg.description}
      </p>
      <p className="mt-2 text-xs text-slate-500">{pkg.profile}</p>

      <PackageBadges pkg={pkg} />

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
          {packageRules.map((rule) => {
            const { when, does, timing } = describeWorkflowRule(rule);
            return (
              <li className="text-slate-600 dark:text-slate-400" key={rule.name}>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {sanitizeChannelText(rule.name)}
                </span>
                <span className="block">
                  {when} → {does}
                  {timing ? ` · ${timing}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {confirmReplace ? (
        <PackageConfirmBlock
          confirmMessage={confirmMessage}
          isApplying={isApplying}
          onCancel={() => setConfirmReplace(false)}
          onConfirm={() => void handleApply(true)}
        />
      ) : (
        <button
          className="mt-4 rounded-md bg-[#D85A30] px-3 py-2 text-sm font-medium text-white hover:bg-[#c24f29] disabled:opacity-60"
          disabled={isApplying || isActive}
          onClick={() => void handleApply(false)}
          type="button"
        >
          {isApplying ? "Aplicando..." : isActive ? "Paquete activo" : applyLabel}
        </button>
      )}
    </div>
  );
}

function PackageBadges({ pkg }: { pkg: WorkflowPackageSummary }) {
  const channels = Array.from(
    new Set(pkg.channels.map((channel) => resolveMessageChannel(channel)))
  );
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {pkg.rules_count} reglas
      </span>
      {channels.map((channel) => (
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
  );
}

function PackageConfirmBlock({
  confirmMessage,
  isApplying,
  onConfirm,
  onCancel
}: {
  confirmMessage: string;
  isApplying: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <p>{confirmMessage}</p>
      <div className="mt-2 flex gap-2">
        <button
          className="rounded-md bg-[#D85A30] px-2 py-1 text-white hover:bg-[#c24f29] disabled:opacity-60"
          disabled={isApplying}
          onClick={onConfirm}
          type="button"
        >
          Sí, reemplazar
        </button>
        <button
          className="rounded-md border border-amber-300 px-2 py-1 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900"
          onClick={onCancel}
          type="button"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
