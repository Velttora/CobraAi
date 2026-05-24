"use client";

import { Package } from "lucide-react";
import {
  useApplyWorkflowPackage,
  useWorkflowPackages,
  WorkflowPackageConflictError
} from "../../hooks/use-workflows";
import { WorkflowPackageCard } from "../workflows/WorkflowPackageCard";

export function WorkflowPackagePicker({ hasRules }: { hasRules: boolean }) {
  const packagesQuery = useWorkflowPackages();
  const packages = packagesQuery.data?.data ?? [];

  return (
    <article className="rounded-xl border border-[#D85A30]/30 bg-gradient-to-br from-orange-50/80 to-white p-5 dark:border-[#D85A30]/40 dark:from-slate-900 dark:to-slate-950">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#D85A30]/10 text-[#D85A30]">
          <Package className="h-5 w-5" />
        </span>
        <PackagePickerIntro hasRules={hasRules} />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {packages.map((pkg) => (
          <TenantWorkflowPackageCard key={pkg.id} pkg={pkg} />
        ))}
      </div>
    </article>
  );
}

function PackagePickerIntro({ hasRules }: { hasRules: boolean }) {
  return (
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
  );
}

function TenantWorkflowPackageCard({
  pkg
}: {
  pkg: import("../../hooks/use-workflows").WorkflowPackageSummary;
}) {
  const applyPackage = useApplyWorkflowPackage();

  return (
    <WorkflowPackageCard
      confirmMessage="Este paquete ya fue aplicado antes. ¿Reemplazar las reglas anteriores de este paquete?"
      isApplying={applyPackage.isPending}
      onApply={async (overwrite) => {
        try {
          await applyPackage.mutateAsync({ packageId: pkg.id, overwrite });
        } catch (error) {
          if (error instanceof WorkflowPackageConflictError) {
            throw error;
          }
          throw error;
        }
      }}
      pkg={pkg}
    />
  );
}
