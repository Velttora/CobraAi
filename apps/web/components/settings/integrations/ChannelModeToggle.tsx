"use client";

import { cn } from "../../../lib/utils";
import type { ChannelId } from "./channel-config";

export interface ChannelModeToggleProps {
  mode: "managed" | "byo";
  onChange: (mode: "managed" | "byo") => void;
  channel?: ChannelId;
  disabled?: boolean;
}

interface Pill {
  value: "managed" | "byo" | "managed-dedicated";
  label: string;
  helper: string;
  /** Set when the option exists but cannot be chosen yet — see EMAIL_PILLS. */
  unavailable?: string;
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
 * Email exposes a third option that is deliberately visible-but-disabled.
 *
 * A dedicated SendGrid subuser is what isolates *sending reputation* between
 * tenants — without it, one tenant's spam complaints drag down everyone's
 * deliverability. Our platform key cannot create subusers today, so managed
 * email falls back to shared sending. Hiding that would misrepresent what the
 * first option actually does, so the dedicated option is shown as pending
 * instead of omitted.
 */
const EMAIL_PILLS: Pill[] = [
  {
    value: "managed",
    label: "Gestionado por CobraAI",
    helper:
      "Autenticamos tu dominio para que el correo salga a tu nombre. El envío sale de la cuenta compartida de CobraAI."
  },
  PILLS[1]!,
  {
    value: "managed-dedicated",
    label: "Cuenta de envío dedicada",
    helper:
      "Igual que la gestionada, pero con reputación de envío aislada por empresa. Aún no está disponible.",
    unavailable: "Requiere una llave de SendGrid con permisos de subusuarios. En preparación."
  }
];

/**
 * `managed` vs `byo` (D-01). The selectable pills share the exact same geometry —
 * UI-SPEC is explicit that BYO must never read as a downgrade: managed gets
 * no "preferred choice" badge, and BYO gets no warning icon.
 */
export function ChannelModeToggle({
  mode,
  onChange,
  channel,
  disabled = false
}: ChannelModeToggleProps): React.ReactElement {
  const pills = channel === "email" ? EMAIL_PILLS : PILLS;
  const active = pills.find((p) => p.value === mode) ?? pills[0]!;
  const pending = pills.find((p) => p.unavailable);

  return (
    <div className="mt-4 space-y-1">
      <span className="block text-sm font-medium">Modo de conexión</span>
      <div className="flex flex-wrap gap-1">
        {pills.map((pill) => (
          <button
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-[#D85A30]/30 focus:ring-offset-1",
              pill.unavailable
                ? "cursor-not-allowed border border-dashed border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
                : mode === pill.value
                  ? "bg-[#D85A30] text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            )}
            disabled={disabled || Boolean(pill.unavailable)}
            key={pill.value}
            onClick={() => {
              if (pill.value !== "managed-dedicated") onChange(pill.value);
            }}
            title={pill.unavailable}
            type="button"
          >
            {pill.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{active.helper}</p>
      {pending && (
        <p className="text-xs text-slate-400">
          {pending.label}: {pending.unavailable}
        </p>
      )}
    </div>
  );
}
