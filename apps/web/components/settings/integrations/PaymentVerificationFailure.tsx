"use client";

import { AlertTriangle } from "lucide-react";
import { providerRemedyMessage } from "./payment-providers";

export interface PaymentVerificationFailureProps {
  provider: string;
  failureMessage: string | null;
  disabled: boolean;
  onRetry: () => void;
}

/**
 * The mandatory, actionable failure block (08-UI-SPEC.md "1. Verification
 * status (D-11)"): the provider's own message verbatim, a provider-specific
 * remedy line, and a secondary `Reintentar verificación` button that
 * re-checks without resending secrets.
 */
export function PaymentVerificationFailure({
  provider,
  failureMessage,
  disabled,
  onRetry
}: PaymentVerificationFailureProps): React.ReactElement {
  return (
    <div className="mt-4 rounded-lg border border-[#A32D2D]/30 bg-red-50/60 p-3 dark:bg-red-950/30" role="alert">
      <p className="flex items-center gap-1 text-sm font-medium text-[#A32D2D]">
        <AlertTriangle className="h-4 w-4" /> Verificación fallida
      </p>
      <p className="mt-1 text-xs font-mono text-slate-700 dark:text-slate-300">{failureMessage}</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Qué hacer: {providerRemedyMessage(provider)}</p>
      <button
        className="mt-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        disabled={disabled}
        onClick={onRetry}
        type="button"
      >
        Reintentar verificación
      </button>
    </div>
  );
}
