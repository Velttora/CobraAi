"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Globe,
  Loader2,
  type LucideIcon
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { formatDateTime } from "../../../lib/formatters";
import type { IntegrationStatus } from "../../../lib/types";

interface StatusEntry {
  label: string;
  className: string;
  Icon: LucideIcon;
  spin?: boolean;
}

// Six-status vocabulary from 08-UI-SPEC.md "Verification status (D-11)". Kept
// local rather than extending `StatusBadge`, whose map is debt-status
// specific (a different domain entirely).
const STATUS_MAP: Record<IntegrationStatus, StatusEntry> = {
  not_configured: {
    label: "Sin configurar",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    Icon: Circle
  },
  verifying: {
    label: "Verificando…",
    className: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    Icon: Loader2,
    spin: true
  },
  verified: {
    label: "Verificado",
    className: "bg-teal-50 text-[#0F6E56] dark:bg-teal-950 dark:text-teal-300",
    Icon: CheckCircle2
  },
  failed: {
    label: "Verificación fallida",
    className: "bg-red-50 text-[#A32D2D] dark:bg-red-950 dark:text-red-300",
    Icon: AlertTriangle
  },
  pending_dns: {
    label: "Falta publicar DNS",
    className: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    Icon: Globe
  },
  pending_meta: {
    label: "Esperando a Meta",
    className: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    Icon: Clock
  }
};

export interface IntegrationStatusBadgeProps {
  status: IntegrationStatus;
  verifiedAt?: string | null;
}

/**
 * Same pill geometry as `components/shared/StatusBadge.tsx`
 * (`rounded-full px-2.5 py-0.5 text-xs font-medium`), with a status map local
 * to integrations. Status is never conveyed by color alone — every entry
 * carries both an icon and a text label (Accessibility Requirements,
 * "Color independence").
 */
export function IntegrationStatusBadge({
  status,
  verifiedAt
}: IntegrationStatusBadgeProps): React.ReactElement {
  const { label, className, Icon, spin } = STATUS_MAP[status];

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
          className
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", spin && "animate-spin")} />
        {label}
      </span>
      {status === "verified" && verifiedAt && (
        <span className="text-xs text-slate-500">Verificado el {formatDateTime(verifiedAt)}</span>
      )}
    </span>
  );
}
