"use client";

import { useState } from "react";
import { EMPTY_BRAND_IDENTITY, type BrandIdentity } from "@cobrai/utils";
import { BrandIdentityPanel } from "../../../../../components/settings/integrations/BrandIdentityPanel";
import { BrandMessagePreview } from "../../../../../components/settings/integrations/BrandMessagePreview";
import { useIntegrations } from "../../../../../hooks/use-integrations";

export default function IntegrationsBrandPage(): React.ReactElement {
  const [draft, setDraft] = useState<BrandIdentity>(EMPTY_BRAND_IDENTITY);
  const integrationsQuery = useIntegrations();
  const whatsappIntegration = integrationsQuery.data?.data.items.find(
    (item) => item.channel === "whatsapp"
  );

  return (
    <div className="grid gap-6 lg:grid-cols-5" data-testid="integrations-brand-page">
      <div className="lg:col-span-3">
        <BrandIdentityPanel onDraftChange={setDraft} />
      </div>
      <div className="lg:col-span-2 lg:sticky lg:top-6">
        <BrandMessagePreview draft={draft} whatsappIntegration={whatsappIntegration} />
      </div>
    </div>
  );
}
