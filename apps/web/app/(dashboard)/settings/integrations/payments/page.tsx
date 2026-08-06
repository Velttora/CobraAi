"use client";

import { PaymentGatewayPanel } from "../../../../../components/settings/integrations/PaymentGatewayPanel";

export default function IntegrationsPaymentsPage(): React.ReactElement {
  return (
    <div className="space-y-6" data-testid="integrations-payments-page">
      <PaymentGatewayPanel />
    </div>
  );
}
