"use client";

import {
  COLOMBIAN_PROVIDER_OPTIONS,
  INTERNATIONAL_PROVIDER_OPTIONS,
  NO_INTEGRATION_PROVIDER_OPTIONS
} from "./payment-providers";

export interface PaymentProviderSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * The seven-option payment provider `<select>` (08-UI-SPEC.md "Screen 2 —
 * Provider options"). Markup and classes copied verbatim from
 * `ContactRetryPolicyPanel.tsx`'s `<select>` (lines 117-136). Colombian
 * gateways first, then Stripe, then the two no-integration options —
 * grouped with `<optgroup>` so the ordering reads as three tiers, not seven
 * flat rows.
 */
export function PaymentProviderSelect({
  value,
  onChange,
  disabled = false
}: PaymentProviderSelectProps): React.ReactElement {
  return (
    <label className="block text-sm font-medium">
      Pasarela de cobro
      <select
        className="mt-1 w-full rounded-md border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-900"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        value={value}
      >
        <optgroup label="Pasarelas en Colombia">
          {COLOMBIAN_PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Internacional">
          {INTERNATIONAL_PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Sin integración">
          {NO_INTEGRATION_PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
