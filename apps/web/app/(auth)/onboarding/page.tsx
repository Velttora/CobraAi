import { CreateOrganization } from "@clerk/nextjs";
import {
  cobraiAuthShellStyle,
  cobraiClerkAppearance
} from "../../../lib/clerk-appearance";

export default function OnboardingPage(): React.ReactElement {
  return (
    <div style={cobraiAuthShellStyle}>
      <CreateOrganization
        afterCreateOrganizationUrl="/dashboard"
        appearance={cobraiClerkAppearance}
      />
    </div>
  );
}
