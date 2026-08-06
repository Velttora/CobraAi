"use client";

import type { ChannelFormProps } from "./channel-config";
import { secretMetaFor } from "./channel-config";
import { ChannelTextField } from "./ChannelTextField";
import { EmailDnsSection } from "./EmailDnsSection";
import { SecretField } from "./SecretField";

/**
 * Correo card connection area. `managed` provisions a SendGrid subuser
 * server-side (no secret from the tenant); `byo` takes the tenant's own
 * SendGrid API key. Both share `domain`/`fromEmail`, and both follow a save
 * with the `EmailDnsSection` DNS/CNAME lifecycle (D-03, plan 08-17 Task 2).
 */
export function EmailFields({
  mode,
  publicConfig,
  setPublicField,
  setSecretField,
  secretsMeta,
  disabled,
  integration
}: ChannelFormProps): React.ReactElement {
  if (mode === "managed") {
    return (
      <div className="mt-4 max-w-md space-y-4">
        <ChannelTextField
          disabled={disabled}
          label="Dominio de correo"
          onChange={(v) => setPublicField("domain", v)}
          placeholder="cobranza.tuempresa.com"
          value={publicConfig.domain ?? ""}
        />
        <ChannelTextField
          disabled={disabled}
          label="Correo remitente"
          onChange={(v) => setPublicField("fromEmail", v)}
          placeholder="cobranza@tuempresa.com"
          type="email"
          value={publicConfig.fromEmail ?? ""}
        />
        <ChannelTextField
          disabled={disabled}
          label="Nombre del remitente"
          onChange={(v) => setPublicField("fromName", v)}
          placeholder="Mi Empresa"
          value={publicConfig.fromName ?? ""}
        />
        <EmailDnsSection integration={integration} />
      </div>
    );
  }

  return (
    <div className="mt-4 max-w-md space-y-4">
      <SecretField
        disabled={disabled}
        label="API key de SendGrid"
        meta={secretMetaFor(secretsMeta, "apiKey")}
        name="apiKey"
        onChange={(v) => setSecretField("apiKey", v)}
      />
      <ChannelTextField
        disabled={disabled}
        label="Correo remitente"
        onChange={(v) => setPublicField("fromEmail", v)}
        placeholder="cobranza@tuempresa.com"
        type="email"
        value={publicConfig.fromEmail ?? ""}
      />
      <ChannelTextField
        disabled={disabled}
        label="Dominio"
        onChange={(v) => setPublicField("domain", v)}
        placeholder="tuempresa.com"
        value={publicConfig.domain ?? ""}
      />
      <p className="text-xs text-slate-500">
        La llave necesita permisos de Mail Send y de autenticación de dominio.
      </p>
      <EmailDnsSection integration={integration} />
    </div>
  );
}
