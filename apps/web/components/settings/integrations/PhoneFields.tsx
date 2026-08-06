"use client";

import type { Route } from "next";
import Link from "next/link";
import type { IntegrationView } from "../../../lib/types";
import type { ChannelFormProps } from "./channel-config";
import { secretMetaFor } from "./channel-config";
import { TwilioByoFields } from "./TwilioByoFields";

export interface PhoneFieldsProps extends ChannelFormProps {
  relatedIntegration?: IntegrationView;
  onActivateVoice: () => void;
  isActivating: boolean;
}

/**
 * Teléfono card connection area. Voice is platform-Vapi with the tenant's
 * Twilio number imported (D-04/D-05) — the tenant must never see "Vapi".
 * `managed` mode reuses WhatsApp's Twilio number/subaccount, so it has no
 * credential form of its own: it either explains why WhatsApp must connect
 * first, or offers `Activar llamadas` once it has.
 */
export function PhoneFields({
  mode,
  publicConfig,
  setPublicField,
  setSecretField,
  secretsMeta,
  disabled,
  integration,
  relatedIntegration,
  onActivateVoice,
  isActivating
}: PhoneFieldsProps): React.ReactElement {
  if (mode === "byo") {
    return (
      <TwilioByoFields
        accountSid={publicConfig.accountSid ?? ""}
        authTokenMeta={secretMetaFor(secretsMeta, "authToken")}
        disabled={disabled}
        helper="Usa las credenciales de la subcuenta de Twilio donde está registrado tu número saliente."
        numberLabel="Número saliente"
        numberPlaceholder="+57 300 123 4567"
        onAccountSidChange={(v) => setPublicField("accountSid", v)}
        onAuthTokenChange={(v) => setSecretField("authToken", v)}
        onPhoneNumberChange={(v) => setPublicField("phoneNumberE164", v)}
        phoneNumber={publicConfig.phoneNumberE164 ?? ""}
      />
    );
  }

  const whatsappConnected = relatedIntegration?.status === "verified";
  const outboundNumber = publicConfig.outboundNumber ?? "";

  if (!whatsappConnected) {
    return (
      <div className="mt-4 max-w-md space-y-2">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Las llamadas usan el mismo número que WhatsApp. Conecta WhatsApp primero.
        </p>
        <div>
          <button
            className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white opacity-60"
            disabled
            title="Conecta WhatsApp primero para activar las llamadas"
            type="button"
          >
            Activar llamadas
          </button>
        </div>
        <Link className="text-sm text-[#D85A30] hover:underline" href={"/settings/integrations?focus=whatsapp" as Route}>
          Ir a WhatsApp
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 max-w-md space-y-3">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        Las llamadas salen desde {outboundNumber || relatedIntegration?.publicConfig.fromNumber?.replace(/^whatsapp:/, "") || "—"}, el mismo número de tu cuenta de Twilio.
      </p>
      {integration?.status !== "verified" && (
        <button
          className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c24f29] disabled:opacity-60"
          disabled={isActivating}
          onClick={onActivateVoice}
          type="button"
        >
          {isActivating ? "Verificando…" : "Activar llamadas"}
        </button>
      )}
    </div>
  );
}
