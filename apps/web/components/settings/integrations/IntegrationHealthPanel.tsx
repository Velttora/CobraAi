"use client";

import type { Route } from "next";
import Link from "next/link";
import { CreditCard, Mail, MessageCircle, Phone } from "lucide-react";
import { formatDateTime } from "../../../lib/formatters";
import type { IntegrationChannel, IntegrationView } from "../../../lib/types";
import { useIntegrationHealth } from "../../../hooks/use-integrations";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";

const CHANNEL_ROWS: { channel: IntegrationChannel; label: string; Icon: typeof MessageCircle }[] = [
  { channel: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
  { channel: "voice", label: "Teléfono", Icon: Phone },
  { channel: "email", label: "Correo", Icon: Mail },
  { channel: "payments", label: "Cobro", Icon: CreditCard }
];

/** Picks the most relevant row for a channel — any configured provider wins over a bare not_configured stub. */
function pickChannelView(items: IntegrationView[], channel: IntegrationChannel): IntegrationView | null {
  const candidates = items.filter((i) => i.channel === channel);
  if (candidates.length === 0) return null;
  return candidates.find((i) => i.status !== "not_configured") ?? (candidates[0] ?? null);
}

function identifierFor(item: IntegrationView): string {
  return (
    item.publicConfig.phoneNumberE164 ??
    item.publicConfig.domain ??
    item.publicConfig.fromEmail ??
    item.publicConfig.merchantId ??
    item.provider
  );
}

function deepLinkFor(channel: IntegrationChannel, item: IntegrationView | null): Route {
  if (channel === "payments") {
    return `/settings/integrations/payments?focus=${item?.provider ?? "payments"}` as Route;
  }
  return `/settings/integrations?focus=${channel}` as Route;
}

function rowDetailAndAction(
  channel: IntegrationChannel,
  item: IntegrationView | null
): { detail: string; action: React.ReactElement } {
  const href = deepLinkFor(channel, item);
  const status = item?.status ?? "not_configured";

  if (status === "verified" && item) {
    return {
      detail: `Verificado el ${formatDateTime(item.verifiedAt ?? "")} · ${identifierFor(item)}`,
      action: (
        <Link className="text-xs text-[#D85A30] hover:underline" href={href}>
          Ver
        </Link>
      )
    };
  }

  if (status === "failed" && item) {
    return {
      detail: item.failureMessage ?? "Verificación fallida",
      action: (
        <Link
          className="ml-auto shrink-0 rounded-md bg-[#D85A30] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#c24f29]"
          href={href}
        >
          Arreglar
        </Link>
      )
    };
  }

  if ((status === "pending_dns" || status === "pending_meta") && item) {
    const waitingFor = status === "pending_dns" ? "DNS" : "a Meta";
    return {
      detail: `Esperando ${waitingFor} desde el ${formatDateTime(item.verifiedAt ?? "")}`,
      action: (
        <Link className="text-xs text-[#D85A30] hover:underline" href={href}>
          Ver instrucciones
        </Link>
      )
    };
  }

  return {
    detail: "Sin configurar — no se envía nada por este canal",
    action: (
      <Link
        className="ml-auto shrink-0 rounded-md bg-[#D85A30] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#c24f29]"
        href={href}
      >
        Configurar
      </Link>
    )
  };
}

export function IntegrationHealthPanel(): React.ReactElement {
  const healthQuery = useIntegrationHealth();

  const items = healthQuery.data?.data.items ?? [];
  const summary = healthQuery.data?.data.summary;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Estado de integraciones
      </h2>

      {healthQuery.isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Cargando…</p>
      ) : healthQuery.isError ? (
        <p className="mt-4 text-sm text-[#A32D2D]">
          No se pudo cargar el estado de las integraciones.
        </p>
      ) : (
        <>
          {summary && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {summary.operational} de {summary.total} integraciones operativas
            </p>
          )}
          <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {CHANNEL_ROWS.map(({ channel, label, Icon }) => {
              const item = pickChannelView(items, channel);
              const { detail, action } = rowDetailAndAction(channel, item);

              return (
                <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-3 text-sm" key={channel}>
                  <Icon className="h-5 w-5 shrink-0 text-slate-400" />
                  <span className="font-medium text-slate-900 dark:text-slate-100">{label}</span>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <IntegrationStatusBadge status={item?.status ?? "not_configured"} />
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-500" title={detail}>
                    {detail}
                  </span>
                  {action}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </article>
  );
}
