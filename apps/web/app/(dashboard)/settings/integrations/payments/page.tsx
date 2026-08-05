"use client";

import { Skeleton } from "../../../../../components/shared/Skeleton";

// TODO(08-18): replace this shell with PaymentGatewayPanel
// per 08-UI-SPEC.md "Screen 2 — Configuración de cobro".
export default function IntegrationsPaymentsPage(): React.ReactElement {
  return (
    <div className="space-y-6" data-testid="integrations-payments-page">
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
