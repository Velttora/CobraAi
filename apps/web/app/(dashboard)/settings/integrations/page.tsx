"use client";

import { Skeleton } from "../../../../components/shared/Skeleton";

// TODO(08-17): replace this shell with the three ChannelCard panels
// (WhatsApp, Teléfono, Correo) per 08-UI-SPEC.md "Screen 1 — Conexión de canales".
export default function IntegrationsChannelsPage(): React.ReactElement {
  return (
    <div className="space-y-6" data-testid="integrations-channels-page">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
