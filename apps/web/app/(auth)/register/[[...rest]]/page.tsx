import { SignUp } from "@clerk/nextjs";
import {
  cobraiAuthShellStyle,
  cobraiClerkAppearance
} from "../../../../lib/clerk-appearance";

export default function RegisterPage(): React.ReactElement {
  return (
    <div style={cobraiAuthShellStyle}>
      <SignUp appearance={cobraiClerkAppearance} />
    </div>
  );
}

