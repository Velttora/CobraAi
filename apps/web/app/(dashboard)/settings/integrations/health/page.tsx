"use client";

import { IntegrationHealthPanel } from "../../../../../components/settings/integrations/IntegrationHealthPanel";
import { UncontactedDebtsTable } from "../../../../../components/settings/integrations/UncontactedDebtsTable";

export default function IntegrationsHealthPage(): React.ReactElement {
  return (
    <div className="space-y-6" data-testid="integrations-health-page">
      <IntegrationHealthPanel />
      <UncontactedDebtsTable />
    </div>
  );
}
