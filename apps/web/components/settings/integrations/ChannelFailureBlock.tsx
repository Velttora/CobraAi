"use client";

import { AlertTriangle } from "lucide-react";
import { formatDateTime } from "../../../lib/formatters";

export interface ChannelFailureBlockProps {
  failureMessage: string;
  remedy: string;
  onRetry: () => void;
  isRetrying: boolean;
  at?: string | null;
}

/**
 * The mandatory, actionable failure block (`08-UI-SPEC.md` "Verification
 * status (D-11)"). Renders the provider's own message verbatim — never
 * paraphrased — plus a per-channel remedy, and re-runs the health check
 * without re-submitting secrets.
 */
export function ChannelFailureBlock({
  failureMessage,
  remedy,
  onRetry,
  isRetrying,
  at
}: ChannelFailureBlockProps): React.ReactElement {
  return (
    <div
      className="mt-4 rounded-lg border border-[#A32D2D]/30 bg-red-50/60 p-3 dark:bg-red-950/30"
      role="alert"
    >
      <p className="flex items-center gap-1.5 text-sm font-medium text-[#A32D2D]">
        <AlertTriangle className="h-4 w-4" />
        Verificación fallida{at ? ` — ${formatDateTime(at)}` : ""}
      </p>
      <p className="mt-2 font-mono text-xs text-slate-700 dark:text-slate-300">{failureMessage}</p>
      {remedy && (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Qué hacer: {remedy}</p>
      )}
      <button
        className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        disabled={isRetrying}
        onClick={onRetry}
        type="button"
      >
        {isRetrying ? "Verificando…" : "Reintentar verificación"}
      </button>
    </div>
  );
}
