"use client";

import { Skeleton } from "../../../../../components/shared/Skeleton";

// TODO(08-19): replace this shell with IntegrationHealthPanel + UncontactedDebtsTable
// per 08-UI-SPEC.md "Screen 4 — Estado y salud".
export default function IntegrationsHealthPage(): React.ReactElement {
  return (
    <div className="space-y-6" data-testid="integrations-health-page">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
