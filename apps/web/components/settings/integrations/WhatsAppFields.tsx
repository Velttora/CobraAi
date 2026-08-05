"use client";

import type { ChannelFormProps } from "./channel-config";
import { secretMetaFor } from "./channel-config";
import { TwilioByoFields } from "./TwilioByoFields";

/**
 * WhatsApp card connection area. `byo` renders the Twilio subaccount
 * fieldset; `managed` renders the Embedded Signup explanation. The actual
 * `EmbeddedSignupButton` (D-25) is wired in by plan 08-17 Task 3 — sequenced
 * last on purpose, since no Meta app exists yet (08-02-SUMMARY.md "Account
 * Prerequisites"), so the BYO path above must be fully usable without it.
 */
export function WhatsAppFields({
  mode,
  publicConfig,
  setPublicField,
  secretDraft,
  setSecretField,
  secretsMeta,
  disabled,
  integration
}: ChannelFormProps): React.ReactElement {
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

  return (
    <div className="mt-4 max-w-md space-y-3">
      {verified ? (
        <p className="text-sm text-slate-700 dark:text-slate-300">
          Número: {displayNumber || "—"} · Nombre visible: {publicConfig.businessName || "—"}
        </p>
      ) : (
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
