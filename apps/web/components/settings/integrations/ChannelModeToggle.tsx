"use client";

import { cn } from "../../../lib/utils";
import type { ChannelId } from "./channel-config";

export interface ChannelModeToggleProps {
  mode: "managed" | "byo";
  onChange: (mode: "managed" | "byo") => void;
  channel: ChannelId;
  disabled?: boolean;
}

interface Pill {
  /** React key, and what distinguishes two pills that map to the same mode. */
  id: string;
  /**
   * Stored mode this pill represents, kept separate from whether it can be
   * picked. A disabled pill still needs its mode so a tenant already saved on
   * it sees *their* option highlighted with its own helper, rather than the
   * card silently describing a mode they are not on. Pills with no mode
   * (buying a number, a dedicated subuser) are not modes at all.
   */
  mode?: "managed" | "byo";
  label: string;
  helper: string;
  /** Why the option cannot be chosen — its presence is what disables the pill. */
  unavailable?: string;
}

const BYO_PILL: Pill = {
  id: "byo",
  mode: "byo",
  label: "Traer mis credenciales",
  helper: "Usas tu propia cuenta del proveedor. Pegas tus credenciales y nosotros solo enviamos."
};

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
    id: "managed",
    mode: "managed",
    label: "Gestionado por CobraAI",
    helper:
      "Autenticamos tu dominio para que el correo salga a tu nombre. El envío sale de la cuenta compartida de CobraAI."
  },
  BYO_PILL,
  {
    id: "managed-dedicated",
    label: "Cuenta de envío dedicada",
    helper:
      "Igual que la gestionada, pero con reputación de envío aislada por empresa. Aún no está disponible.",
    unavailable: "Requiere una llave de SendGrid con permisos de subusuarios. En preparación."
  }
];

/**
 * WhatsApp managed onboarding runs through Meta Embedded Signup, which needs a
 * Meta app that does not exist yet — so the button could only ever reach its
 * `sdk_unavailable` fallback. Offering it as a live choice sends the tenant
 * down a path that dead-ends, so BYO leads and managed is shown disabled.
 */
const WHATSAPP_PILLS: Pill[] = [
  BYO_PILL,
  {
    id: "managed",
    label: "Gestionado por CobraAI",
    helper: "Conectamos tu número por ti mediante Meta Embedded Signup. Aún no está disponible.",
    unavailable: "Requiere nuestra app de Meta aprobada para Embedded Signup. En preparación."
  }
];

/**
 * Voice keeps both managed options visible and separate, because the old
 * single pill blurred them: buying a new number, and reusing the one already
 * on the tenant's Twilio subaccount from WhatsApp. Neither is offered — the
 * purchase is not built, and the reuse path depends on managed WhatsApp, which
 * is itself blocked on the Meta app. Only BYO can be completed today.
 */
const VOICE_PILLS: Pill[] = [
  BYO_PILL,
  {
    id: "managed-buy",
    label: "Comprar y gestionar en Twilio",
    helper: "Compramos un número nuevo a tu nombre y lo configuramos. Aún no está disponible.",
    unavailable: "La compra automática de números todavía no está implementada."
  },
  {
    id: "managed",
    mode: "managed",
    label: "Gestionado por CobraAI",
    helper: "Usamos el número que ya tienes conectado en WhatsApp. Aún no está disponible.",
    unavailable: "Depende del WhatsApp gestionado, que todavía no está disponible."
  }
];

const PILLS_BY_CHANNEL: Record<ChannelId, Pill[]> = {
  whatsapp: WHATSAPP_PILLS,
  voice: VOICE_PILLS,
  email: EMAIL_PILLS
};

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
  const pills = PILLS_BY_CHANNEL[channel];
  const active = pills.find((p) => p.mode === mode) ?? pills[0]!;
  const pending = pills.filter((p) => p.unavailable);

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
                : mode === pill.mode
                  ? "bg-[#D85A30] text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            )}
            disabled={disabled || Boolean(pill.unavailable)}
            key={pill.id}
            onClick={() => {
              if (!pill.unavailable && pill.mode) onChange(pill.mode);
            }}
            title={pill.unavailable}
            type="button"
          >
            {pill.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{active.helper}</p>
      {pending.map((pill) => (
        <p className="text-xs text-slate-400" key={pill.id}>
          {pill.label}: {pill.unavailable}
        </p>
      ))}
    </div>
  );
}
