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
