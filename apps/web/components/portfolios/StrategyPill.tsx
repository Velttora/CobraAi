import type { Portfolio } from "../../lib/types";

const LABELS: Record<NonNullable<Portfolio["automationStatus"]>, string> = {
  none: "Sin automatización",
  package: "Paquete",
  custom: "Personalizada"
};

const STYLES: Record<NonNullable<Portfolio["automationStatus"]>, string> = {
  none: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  package: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  custom: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"
};

export function StrategyPill({
  automationStatus,
  activePackageSlug
}: {
  automationStatus?: Portfolio["automationStatus"];
  activePackageSlug?: string | null;
}): React.ReactElement {
  const status = automationStatus ?? "none";
  const label =
    status === "package" && activePackageSlug
      ? `Paquete · ${activePackageSlug.replace(/_/g, " ")}`
      : LABELS[status];

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STYLES[status]}`}
    >
      {label}
    </span>
  );
}
