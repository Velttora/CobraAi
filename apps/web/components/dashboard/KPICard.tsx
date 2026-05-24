import { cn } from "../../lib/utils";
import { Skeleton } from "../shared/Skeleton";

export type KPICardProps = {
  label: string;
  value: string;
  hint?: string;
  trend?: { value: string; positive?: boolean };
  alert?: boolean;
  loading?: boolean;
};

export function KPICard({
  label,
  value,
  hint,
  trend,
  alert,
  loading
}: KPICardProps) {
  if (loading) {
    return (
      <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-8 w-24" />
        <Skeleton className="mt-2 h-3 w-32" />
      </article>
    );
  }

  return (
    <article
      className={cn(
        "rounded-xl border bg-white p-5 dark:bg-slate-900",
        alert
          ? "border-[#A32D2D]/30 dark:border-[#A32D2D]/40"
          : "border-slate-200 dark:border-slate-800"
      )}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </p>
      {(hint || trend) && (
        <p className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {trend && (
            <span
              className={cn(
                "font-medium",
                trend.positive ? "text-[#0F6E56]" : "text-[#A32D2D]"
              )}
            >
              {trend.value}
            </span>
          )}
          {hint}
        </p>
      )}
    </article>
  );
}
