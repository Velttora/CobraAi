"use client";

import type { IntegrationSecretMeta } from "../../../lib/types";
import type { PaymentFieldDescriptor } from "./payment-providers";
import { SecretField } from "./SecretField";

export interface PaymentCredentialFieldsProps {
  fields: PaymentFieldDescriptor[];
  secrets: IntegrationSecretMeta[];
  disabled: boolean;
  getValue: (name: string) => string;
  onPublicChange: (name: string, value: string) => void;
  onSecretChange: (name: string, value: string | null) => void;
}

/**
 * Renders one provider's credential fields — a plain, required `<input>` for
 * every `publicConfig` field and a `SecretField` for every `secrets` field
 * (08-UI-SPEC.md "Screen 2 — Provider options"). Field order/labels come
 * straight from `PAYMENT_PROVIDER_FIELDS`, so switching provider swaps the
 * whole field set without any per-provider branching here.
 */
export function PaymentCredentialFields({
  fields,
  secrets,
  disabled,
  getValue,
  onPublicChange,
  onSecretChange
}: PaymentCredentialFieldsProps): React.ReactElement {
  return (
    <>
      {fields
        .filter((f) => !f.secret)
        .map((f) => (
          <label className="block text-sm font-medium" htmlFor={`field-${f.name}`} key={f.name}>
            {f.label} <span aria-hidden="true">*</span>
            <input
              aria-required="true"
              className="mt-1 w-full rounded-md border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-900"
              disabled={disabled}
              id={`field-${f.name}`}
              onChange={(e) => onPublicChange(f.name, e.target.value)}
              required
              type="text"
              value={getValue(f.name)}
            />
          </label>
        ))}
      {fields
        .filter((f) => f.secret)
        .map((f) => (
          <SecretField
            disabled={disabled}
            key={f.name}
            label={f.label}
            meta={secrets.find((s) => s.field === f.name) ?? null}
            name={f.name}
            onChange={(v) => onSecretChange(f.name, v)}
          />
        ))}
    </>
  );
}
