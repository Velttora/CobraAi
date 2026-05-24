import { cn } from "../../lib/utils";

export function ScoreBar({
  score,
  className
}: {
  score: number | null | undefined;
  className?: string;
}) {
  const value = Math.max(0, Math.min(100, score ?? 0));
  const color =
    value >= 80
      ? "bg-[#A32D2D]"
      : value >= 60
        ? "bg-[#D85A30]"
        : value >= 40
          ? "bg-[#C49A00]"
          : "bg-[#0F6E56]";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-slate-600 dark:text-slate-400">
        {score != null ? value : "—"}
      </span>
    </div>
  );
}
