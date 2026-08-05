"use client";

import { CheckCircle2, CreditCard } from "lucide-react";
import type { IntegrationStatus } from "../../../lib/types";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";
import { displayNameFor } from "./payment-providers";

export interface PaymentPanelHeaderProps {
  provider: string;
  status: IntegrationStatus;
  verifiedAt: string | null;
  configuredOnly: boolean;
  isSaving: boolean;
  children: React.ReactNode;
}

/**
 * Icon tile, title, description, the D-06 BYO-only note, the status badge
 * (with the `Configurado` override for `external_link`/`transfer` — those
 * two never actually reach `Verificado`, since nothing was checked against a
 * provider) and the async-status `aria-live` region shared by every fork of
 * Screen 2's panel body, which is passed in as `children`.
 */
export function PaymentPanelHeader({
  provider,
  status,
  verifiedAt,
  configuredOnly,
  isSaving,
  children
}: PaymentPanelHeaderProps): React.ReactElement {
  const badge =
    configuredOnly && status === "verified" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-[#0F6E56] dark:bg-teal-950 dark:text-teal-300">
        <CheckCircle2 className="h-3.5 w-3.5" /> Configurado
      </span>
    ) : (
      <IntegrationStatusBadge status={status} verifiedAt={verifiedAt} />
    );

  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <CreditCard className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Cómo cobras</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Define por dónde te pagan tus deudores. El enlace de pago que reciben lleva a tu cuenta.
            </p>
          </div>
          {badge}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          El cobro siempre va a tu propia cuenta. CobraAI nunca recibe el dinero de tus deudores.
        </p>
        <p aria-live="polite" className="sr-only">
          {isSaving
            ? `Verificando credenciales de ${displayNameFor(provider)}`
            : status === "verified"
              ? `${displayNameFor(provider)} verificado`
              : status === "failed"
                ? `La verificación de ${displayNameFor(provider)} falló`
                : ""}
        </p>
        {children}
      </div>
    </div>
  );
}
