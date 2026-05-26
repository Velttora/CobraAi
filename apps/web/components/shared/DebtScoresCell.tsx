"use client";

import { ScoreBar } from "./ScoreBar";

export function DebtScoresCell({
  recoveryScore,
  priorityScore
}: {
  recoveryScore: number | null | undefined;
  priorityScore: number | null | undefined;
}) {
  const recovery = recoveryScore ?? null;
  const priority = priorityScore ?? recovery;

  return (
    <div
      className="min-w-[140px] space-y-1.5"
      title={`Recuperación: ${recovery ?? "—"} (probabilidad de pago)\nPrioridad hoy: ${priority ?? "—"} (valor esperado de gestión)`}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500">
        <span className="w-14">Prior.</span>
        <ScoreBar className="flex-1" mode="priority" score={priority} />
      </div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500">
        <span className="w-14">Recup.</span>
        <ScoreBar className="flex-1" mode="recovery" score={recovery} />
      </div>
    </div>
  );
}
