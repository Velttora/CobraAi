"use client";

import type { IntegrationSecretMeta } from "../../../lib/types";
import { fieldLabelFor, providerLabel } from "./payment-providers";

export interface PaymentReadOnlyViewProps {
  activeProvider: string | null;
  selectedProvider: string;
  secrets: IntegrationSecretMeta[];
}

/**
 * Non-admin mirror of the credential form (08-UI-SPEC.md "Screen 2" —
 * "A non-admin sees the read-only `<dl>` view … never a form"). Shows only
 * `lastFour`, never a value, and closes with the standard non-admin notice.
 */
export function PaymentReadOnlyView({
  activeProvider,
  selectedProvider,
  secrets
}: PaymentReadOnlyViewProps): React.ReactElement {
  return (
    <dl className="mt-4 max-w-md space-y-3">
      <div>
        <dt className="text-sm font-medium text-slate-700 dark:text-slate-300">Pasarela de cobro</dt>
        <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
          {activeProvider ? providerLabel(activeProvider) : "—"}
        </dd>
      </div>
      {secrets.map((s) => (
        <div key={s.field}>
          <dt className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {fieldLabelFor(selectedProvider, s.field)}
          </dt>
          <dd className="mt-1 font-mono text-sm text-slate-900 dark:text-slate-100">
            {s.lastFour ? `•••• ${s.lastFour}` : "—"}
          </dd>
        </div>
      ))}
      <p className="text-sm text-slate-500">Solo un administrador puede cambiar esta configuración.</p>
    </dl>
  );
}
