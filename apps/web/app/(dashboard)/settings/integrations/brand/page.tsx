"use client";

import { BrandIdentityPanel } from "../../../../../components/settings/integrations/BrandIdentityPanel";
import { Skeleton } from "../../../../../components/shared/Skeleton";

// TODO(08-19 Task 2): replace the Skeleton placeholder with BrandMessagePreview
// per 08-UI-SPEC.md "Screen 3 — Identidad de marca".
export default function IntegrationsBrandPage(): React.ReactElement {
  return (
    <div className="grid gap-6 lg:grid-cols-5" data-testid="integrations-brand-page">
      <div className="lg:col-span-3">
        <BrandIdentityPanel />
      </div>
      <Skeleton className="h-64 w-full lg:col-span-2" />
    </div>
  );
}
