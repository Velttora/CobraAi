"use client";

import { cn } from "../../../lib/utils";

export interface ChannelModeToggleProps {
  mode: "managed" | "byo";
  onChange: (mode: "managed" | "byo") => void;
  disabled?: boolean;
}

interface Pill {
  value: "managed" | "byo";
  label: string;
  helper: string;
}

const PILLS: Pill[] = [
  {
    value: "managed",
    label: "Gestionado por CobraAI",
    helper: "Creamos y administramos la cuenta del proveedor por ti. Solo autorizas la conexión."
  },
  {
    value: "byo",
    label: "Traer mis credenciales",
    helper: "Usas tu propia cuenta del proveedor. Pegas tus credenciales y nosotros solo enviamos."
  }
];

/**
 * `managed` vs `byo` (D-01). Both pills share the exact same geometry —
 * UI-SPEC is explicit that BYO must never read as a downgrade: managed gets
 * no "preferred choice" badge, and BYO gets no warning icon.
 */
export function ChannelModeToggle({
  mode,
  onChange,
  disabled = false
}: ChannelModeToggleProps): React.ReactElement {
  const active = PILLS.find((p) => p.value === mode) ?? PILLS[0]!;

  return (
    <div className="mt-4 space-y-1">
      <span className="block text-sm font-medium">Modo de conexión</span>
      <div className="flex flex-wrap gap-1">
        {PILLS.map((pill) => (
          <button
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-[#D85A30]/30 focus:ring-offset-1",
              mode === pill.value
                ? "bg-[#D85A30] text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            )}
            disabled={disabled}
            key={pill.value}
            onClick={() => onChange(pill.value)}
            type="button"
          >
            {pill.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{active.helper}</p>
    </div>
  );
}
