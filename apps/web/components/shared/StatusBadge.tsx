import { cn } from "../../lib/utils";

const statusStyles: Record<string, string> = {
  new: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  active: "bg-teal-50 text-[#0F6E56] dark:bg-teal-950 dark:text-teal-300",
  in_collection:
    "bg-orange-50 text-[#D85A30] dark:bg-orange-950 dark:text-orange-300",
  promise_to_pay: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  paid: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  written_off: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  disputed: "bg-red-50 text-[#A32D2D] dark:bg-red-950 dark:text-red-300"
};

export function StatusBadge({
  status,
  className
}: {
  status: string;
  className?: string;
}) {
  const label = status.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        statusStyles[status] ?? statusStyles.new,
        className
      )}
    >
      {label}
    </span>
  );
}
