import { SignIn } from "@clerk/nextjs";
import {
  cobraiAuthShellStyle,
  cobraiClerkAppearance
} from "../../../../lib/clerk-appearance";

export default function LoginPage(): React.ReactElement {
  return (
    <div style={cobraiAuthShellStyle}>
      <SignIn appearance={cobraiClerkAppearance} />
    </div>
  );
}
