import { Mail, MessageCircle, Phone, type LucideIcon } from "lucide-react";
import type { IntegrationSecretMeta, IntegrationView } from "../../../lib/types";

/**
 * Screen 1 (`08-UI-SPEC.md` "Conexión de canales") has exactly three channels.
 * `channel` here is a UI concept distinct from `IntegrationView.channel` —
 * each maps to a single, fixed backend provider (never a choice the tenant
 * makes), which is what lets `ChannelCard` look up its own row in the flat
 * `useIntegrations()` list.
 */
export type ChannelId = "whatsapp" | "voice" | "email";

export const PROVIDER_BY_CHANNEL: Record<ChannelId, string> = {
  whatsapp: "twilio_whatsapp",
  voice: "twilio_voice",
  email: "sendgrid"
};

interface ChannelCopy {
  title: string;
  description: string;
  Icon: LucideIcon;
  /** Primary CTA label for `mode: "managed"` (Screen 1 copy matrix). */
  primaryCtaManaged: string;
  /** "Qué hacer" remedy line for the mandatory failure block (D-11). */
  remedy: string;
}

export const CHANNEL_COPY: Record<ChannelId, ChannelCopy> = {
  whatsapp: {
    title: "WhatsApp",
    description:
      "El canal con mayor tasa de respuesta. Tu número, tu nombre comercial, tu cuenta de WhatsApp Business.",
    Icon: MessageCircle,
    primaryCtaManaged: "Conectar con WhatsApp",
    remedy:
      "Verifica que tu empresa esté verificada en Meta Business Manager y que el número no esté ya conectado a otra plataforma de WhatsApp."
  },
  voice: {
    title: "Teléfono (llamadas)",
    description: "Llamadas automáticas con voz. Salen desde el mismo número de tu empresa.",
    Icon: Phone,
    primaryCtaManaged: "Activar llamadas",
    remedy: "Revisa que el número tenga habilitadas las llamadas salientes en tu cuenta de Twilio."
  },
  email: {
    title: "Correo",
    description:
      "Correos firmados con tu dominio, para que no caigan en spam y las respuestas te lleguen a ti.",
    Icon: Mail,
    primaryCtaManaged: "Conectar correo",
    remedy:
      "Revisa que hayas publicado los tres registros CNAME exactamente como se muestran abajo. Algunos proveedores agregan el dominio dos veces al nombre."
  }
};

/**
 * Mode an unconfigured channel starts on — the first option the tenant can
 * actually complete. Only email still offers a working managed path: WhatsApp
 * needs the Meta app, and voice needs number purchasing, neither of which
 * exists. Defaulting those to `managed` would open the card on an option that
 * cannot be selected or submitted.
 */
export const DEFAULT_MODE: Record<ChannelId, "managed" | "byo"> = {
  whatsapp: "byo",
  voice: "byo",
  email: "managed"
};

interface RequiredFields {
  public: string[];
  secret: string[];
}

/** Fields a save needs before the submit button unlocks (mirrors `isDirty`/valid checks in `ContactRetryPolicyPanel.tsx`). */
export const REQUIRED_FIELDS: Record<ChannelId, Record<"managed" | "byo", RequiredFields>> = {
  whatsapp: {
    managed: { public: [], secret: [] },
    byo: { public: ["accountSid", "phoneNumberE164"], secret: ["authToken"] }
  },
  voice: {
    managed: { public: [], secret: [] },
    byo: { public: ["accountSid", "phoneNumberE164"], secret: ["authToken"] }
  },
  email: {
    managed: { public: ["domain", "fromEmail"], secret: [] },
    byo: { public: ["domain", "fromEmail"], secret: ["apiKey"] }
  }
};

/**
 * Shared props every per-channel connection-area component receives from
 * `ChannelCard`. `publicConfig` is already the merged (saved + draft) view;
 * `secretDraft`/`secretsMeta` are kept separate because a secret's "current
 * value" is never readable (D-26) — only `secretsMeta` (lastFour/savedAt)
 * tells the field whether something is already stored.
 */
export interface ChannelFormProps {
  mode: "managed" | "byo";
  publicConfig: Record<string, string>;
  setPublicField: (key: string, value: string) => void;
  secretDraft: Record<string, string | null>;
  setSecretField: (key: string, value: string | null) => void;
  secretsMeta: IntegrationSecretMeta[];
  disabled: boolean;
  integration?: IntegrationView;
}

export function secretMetaFor(meta: IntegrationSecretMeta[], field: string): IntegrationSecretMeta | null {
  return meta.find((s) => s.field === field) ?? null;
}

/**
 * Reads back the number a Twilio channel was saved with.
 *
 * The form posts `phoneNumberE164`, but the backend never stores that key: it
 * normalizes to `fromNumber` (WhatsApp, prefixed `whatsapp:`) or
 * `outboundNumber` (voice). A form reading `phoneNumberE164` therefore comes
 * back blank after a reload even though the channel saved correctly, which
 * reads as data loss.
 *
 * `phoneNumberE164` is checked first because it is the draft key the user is
 * currently typing into — the stored keys are the fallback for a row that was
 * saved before the backend started persisting it, so existing tenants are
 * repaired on read rather than needing a migration.
 */
export function savedNumberFrom(publicConfig: Record<string, string>): string {
  const value = publicConfig.phoneNumberE164 ?? publicConfig.fromNumber ?? publicConfig.outboundNumber;
  return (value ?? "").replace(/^whatsapp:/, "");
}

/**
 * Current value of a required public field, for both the "is the form
 * complete" check and the save payload. Only `phoneNumberE164` needs
 * resolving — it is the one required key the backend stores under a
 * different name.
 */
export function requiredValueFor(key: string, publicConfig: Record<string, string>): string {
  return key === "phoneNumberE164" ? savedNumberFrom(publicConfig) : (publicConfig[key] ?? "");
}

/**
 * Public config to send on save.
 *
 * A save replaces the whole public config server-side, so posting only the
 * draft drops every required field the user did not retype — reload, correct
 * just the account SID, and the phone number is wiped. Untouched required
 * fields are re-sent from what is already stored.
 */
export function buildPublicPayload(
  requiredPublic: string[],
  publicDraft: Record<string, string>,
  publicConfig: Record<string, string>
): Record<string, string> {
  const payload: Record<string, string> = { ...publicDraft };
  for (const key of requiredPublic) {
    if (payload[key] === undefined) payload[key] = requiredValueFor(key, publicConfig);
  }
  return payload;
}

/**
 * Chooses the "Qué hacer" line from the provider's actual failure, instead of
 * always showing the channel's default.
 *
 * A fixed per-channel remedy is right only when the failure is the expected
 * one. When SendGrid answers `authorization required` — our platform account's
 * credential, nothing the tenant controls — telling them to re-check their
 * CNAME records sends them to fix something that was never broken. Same for a
 * key that is valid but lacks the scopes to provision.
 */
export function remedyFor(channel: ChannelId, failureMessage?: string | null): string {
  const fallback = CHANNEL_COPY[channel].remedy;
  if (!failureMessage) return fallback;

  const message = failureMessage.toLowerCase();

  if (
    message.includes("authorization required") ||
    message.includes("unauthorized") ||
    message.includes("authentication required")
  ) {
    return (
      "Esto no es tu configuración: la plataforma no pudo autenticarse con el proveedor. " +
      "Avísale al equipo de CobraAI, y mientras tanto conecta tus propias credenciales."
    );
  }

  if (message.includes("access forbidden") || message.includes("permission")) {
    return (
      "La cuenta de la plataforma no tiene permisos para aprovisionar este canal. " +
      "Avísale al equipo de CobraAI, o conecta tus propias credenciales."
    );
  }

  return fallback;
}
