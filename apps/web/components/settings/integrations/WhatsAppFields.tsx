"use client";

import type { ChannelFormProps } from "./channel-config";
import { secretMetaFor } from "./channel-config";
import { EmbeddedSignupButton } from "./EmbeddedSignupButton";
import { TwilioByoFields } from "./TwilioByoFields";

export interface WhatsAppFieldsProps extends ChannelFormProps {
  onSwitchToByo: () => void;
}

/**
 * WhatsApp card connection area. `byo` renders the Twilio subaccount
 * fieldset; `managed` renders `EmbeddedSignupButton` (D-25) alongside the
 * three-step Embedded Signup explanation. The BYO path above is fully
 * usable on its own — no Meta app exists yet (08-02-SUMMARY.md "Account
 * Prerequisites") — which is exactly what `EmbeddedSignupButton`'s
 * `sdk_unavailable` fallback (and its "switch to BYO" link) depends on.
 */
export function WhatsAppFields({
  mode,
  publicConfig,
  setPublicField,
  setSecretField,
  secretsMeta,
  disabled,
  integration,
  onSwitchToByo
}: WhatsAppFieldsProps): React.ReactElement {
  if (mode === "byo") {
    return (
      <TwilioByoFields
        accountSid={publicConfig.accountSid ?? ""}
        authTokenMeta={secretMetaFor(secretsMeta, "authToken")}
        disabled={disabled}
        helper="Usa las credenciales de la subcuenta de Twilio donde está registrado tu WABA."
        numberLabel="Número de WhatsApp"
        numberPlaceholder="+57 300 123 4567"
        onAccountSidChange={(v) => setPublicField("accountSid", v)}
        onAuthTokenChange={(v) => setSecretField("authToken", v)}
        onPhoneNumberChange={(v) => setPublicField("phoneNumberE164", v)}
        phoneNumber={publicConfig.phoneNumberE164 ?? ""}
      />
    );
  }

  const verified = integration?.status === "verified";
  const displayNumber = (publicConfig.fromNumber ?? "").replace(/^whatsapp:/, "");

  if (verified) {
    return (
      <div className="mt-4 max-w-md space-y-3">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Número: {displayNumber || "—"} · Nombre visible: {publicConfig.businessName || "—"}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 max-w-md space-y-3">
      <EmbeddedSignupButton integration={integration} onSwitchToByo={onSwitchToByo} />
      {integration?.status !== "pending_meta" && (
        <>
          <ol className="list-decimal space-y-1 pl-4 text-sm text-slate-600 dark:text-slate-400">
            <li>Inicias sesión con tu cuenta de Facebook Business.</li>
            <li>Meta verifica tu empresa y crea tu número de WhatsApp Business.</li>
            <li>Nosotros conectamos ese número a CobraAI.</li>
          </ol>
          <p className="text-xs text-slate-500">
            Necesitas ser administrador del Business Manager de tu empresa en Meta.
          </p>
        </>
      )}
    </div>
  );
}
