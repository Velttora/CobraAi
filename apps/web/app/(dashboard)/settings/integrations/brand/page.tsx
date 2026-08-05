"use client";

import { Skeleton } from "../../../../../components/shared/Skeleton";

// TODO(08-19): replace this shell with BrandIdentityPanel + BrandMessagePreview
// per 08-UI-SPEC.md "Screen 3 — Identidad de marca".
export default function IntegrationsBrandPage(): React.ReactElement {
  return (
    <div className="grid gap-6 lg:grid-cols-5" data-testid="integrations-brand-page">
      <Skeleton className="h-64 w-full lg:col-span-3" />
      <Skeleton className="h-64 w-full lg:col-span-2" />
    </div>
  );
}
