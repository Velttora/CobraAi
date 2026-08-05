"use client";

export interface ChannelTextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: "text" | "email";
}

/** Plain-text form field matching `ContactRetryPolicyPanel.tsx`'s wrapped-label input convention. */
export function ChannelTextField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  type = "text"
}: ChannelTextFieldProps): React.ReactElement {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        className="mt-1 w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-900"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}
