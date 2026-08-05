"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../../../lib/utils";
import { useIntegrations, useUncontactedDebts } from "../../../hooks/use-integrations";

interface TabDef {
  href: string;
  label: string;
}

const TABS: TabDef[] = [
  { href: "/settings/integrations", label: "Canales" },
  { href: "/settings/integrations/payments", label: "Cobro" },
  { href: "/settings/integrations/brand", label: "Marca" },
  { href: "/settings/integrations/health", label: "Estado" }
];

/**
 * Link-based tab nav (08-UI-SPEC.md "Routing & Layout") — real `<Link>`s with
 * `aria-current="page"`. These anchors navigate, so they deliberately do not
 * carry the ARIA tab role reserved for non-navigating tab widgets
 * (Accessibility Requirements, "Tabs").
 */
export function IntegrationsTabs(): React.ReactElement {
  const pathname = usePathname();
  const integrationsQuery = useIntegrations();
  const uncontactedQuery = useUncontactedDebts(1);

  const items = integrationsQuery.data?.data.items ?? [];
  const channelItems = items.filter((i) => i.channel !== "payments");
  const hasFailedChannel = channelItems.some((i) => i.status === "failed");
  const hasPendingDns = channelItems.some((i) => i.status === "pending_dns");
  const paymentsItem = items.find((i) => i.channel === "payments");
  const paymentsFailed = paymentsItem
    ? paymentsItem.status === "failed" || paymentsItem.status === "not_configured"
    : false;
  const blockedCount = uncontactedQuery.data?.data.total ?? 0;

  return (
    <nav aria-label="Secciones de integraciones" className="flex flex-wrap gap-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const isChannels = tab.href === "/settings/integrations";
        const isPayments = tab.href === "/settings/integrations/payments";
        const isHealth = tab.href === "/settings/integrations/health";

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition",
              active
                ? "bg-[#D85A30] text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            )}
            href={tab.href as Route}
            key={tab.href}
          >
            {tab.label}
            {isChannels && hasFailedChannel && (
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-500" />
            )}
            {isChannels && !hasFailedChannel && hasPendingDns && (
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
            {isPayments && paymentsFailed && (
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-500" />
            )}
            {isHealth && blockedCount > 0 && (
              <span
                aria-label={`${blockedCount} deudas bloqueadas`}
                className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
              >
                {blockedCount > 99 ? "99+" : blockedCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
