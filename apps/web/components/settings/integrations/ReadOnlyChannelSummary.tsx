"use client";

const FIELD_LABELS: Record<string, string> = {
  accountSid: "Account SID",
  phoneNumberE164: "Número",
  fromNumber: "Número",
  outboundNumber: "Número saliente",
  domain: "Dominio",
  fromEmail: "Correo remitente",
  fromName: "Nombre del remitente",
  businessName: "Nombre visible"
};

export interface ReadOnlyChannelSummaryProps {
  mode: "managed" | "byo";
  publicConfig: Record<string, string>;
}

/**
 * Non-admin fork (`OrganizationSettingsPanel.tsx`'s admin/read-only pattern,
 * A-14): the same data as the form, rendered as a `<dl>`, never a form.
 * Secrets never appear here — only `lastFour` would, and this view doesn't
 * even receive `secretsMeta`, so there is nothing to leak.
 */
export function ReadOnlyChannelSummary({
  mode,
  publicConfig
}: ReadOnlyChannelSummaryProps): React.ReactElement {
  const entries = Object.entries(publicConfig).filter(([, value]) => value);

  return (
    <div className="mt-4 max-w-md">
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-sm font-medium text-slate-700 dark:text-slate-300">Modo</dt>
          <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
            {mode === "managed" ? "Gestionado por CobraAI" : "Traer mis credenciales"}
          </dd>
        </div>
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {FIELD_LABELS[key] ?? key}
            </dt>
            <dd className="mt-1 truncate text-sm text-slate-900 dark:text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-slate-500">
        Solo un administrador puede cambiar esta configuración.
      </p>
    </div>
  );
}
