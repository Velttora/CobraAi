"use client";

import { ChannelCard } from "../../../../components/settings/integrations/ChannelCard";
import { Skeleton } from "../../../../components/shared/Skeleton";
import { useIntegrations } from "../../../../hooks/use-integrations";
import type { IntegrationView } from "../../../../lib/types";

/**
 * Screen 1 — Conexión de canales (08-UI-SPEC.md). Three cards in the fixed
 * order WhatsApp, Teléfono, Correo — highest-impact channel first. The
 * WhatsApp integration is passed into the Teléfono card as
 * `relatedIntegration` so it can express its "connect WhatsApp first" state
 * (D-05: voice shares WhatsApp's Twilio number/subaccount).
 */
export default function IntegrationsChannelsPage(): React.ReactElement {
  const integrationsQuery = useIntegrations();

  if (integrationsQuery.isLoading) {
    return (
      <div className="space-y-6" data-testid="integrations-channels-page">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const items = integrationsQuery.data?.data.items ?? [];
  const byProvider = (provider: string): IntegrationView | undefined =>
    items.find((item) => item.provider === provider);

  const whatsapp = byProvider("twilio_whatsapp");

  return (
    <div className="space-y-6" data-testid="integrations-channels-page">
      <ChannelCard channel="whatsapp" integration={whatsapp} />
      <ChannelCard channel="voice" integration={byProvider("twilio_voice")} relatedIntegration={whatsapp} />
      <ChannelCard channel="email" integration={byProvider("sendgrid")} />
    </div>
  );
}
