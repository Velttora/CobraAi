"use client";

import { AlertTriangle } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useIntegrations, useUncontactedDebts } from "../../../hooks/use-integrations";

/**
 * D-16 degraded-state banner. Renders only when the tenant has ZERO channels
 * in `verified` status, on all four Integraciones tabs (it lives in the
 * shared layout). Partial degradation — at least one channel verified, but
 * not all — is shown on the affected ChannelCard and tab dot instead: never
 * nag a tenant who can already send.
 */
export function IntegrationSetupBanner(): React.ReactElement | null {
  const integrationsQuery = useIntegrations();
  const uncontactedQuery = useUncontactedDebts(1);

  if (integrationsQuery.isLoading) return null;

  const items = integrationsQuery.data?.data.items ?? [];
  const hasVerified = items.some((i) => i.status === "verified");
  if (hasVerified) return null;

  const blockedCount = uncontactedQuery.data?.data.total ?? 0;

  return (
    <div
      className="rounded-xl border border-[#A32D2D]/40 bg-red-50/70 p-5 dark:border-[#A32D2D]/50 dark:bg-red-950/30"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#A32D2D]/10 text-[#A32D2D]">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No estamos contactando a tus deudores
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Ningún canal está configurado, así que ninguna gestión sale.
          </p>
          {blockedCount > 0 && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {blockedCount} deudas están detenidas esperando por esto.
            </p>
          )}
          <div className="mt-4 flex items-center gap-4">
            <Link
              className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c24f29]"
              href={"/settings/integrations?focus=whatsapp" as Route}
            >
              Conectar WhatsApp
            </Link>
            <Link
              className="text-sm text-[#D85A30] hover:underline"
              href={"/settings/integrations/health" as Route}
            >
              Ver deudas detenidas
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
