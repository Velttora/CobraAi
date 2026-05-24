"use client";

import { cn } from "../../lib/utils";

export function ScoreCircle({
  score,
  className
}: {
  score: number | null | undefined;
  className?: string;
}) {
  const value = Math.max(0, Math.min(100, score ?? 0));
  const color =
    value >= 80
      ? "#A32D2D"
      : value >= 60
        ? "#D85A30"
        : value >= 40
          ? "#C49A00"
          : "#0F6E56";

  return (
    <figure
      className={cn(
        "flex h-24 w-24 flex-col items-center justify-center rounded-full border-4 bg-white dark:bg-slate-900",
        className
      )}
      style={{ borderColor: color }}
    >
      <span className="text-2xl font-bold" style={{ color }}>
        {score != null ? value : "—"}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-slate-500">
        Score IA
      </span>
    </figure>
  );
}
