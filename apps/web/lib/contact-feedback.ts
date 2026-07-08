import { toast } from "sonner";
import { formatDateTime } from "./formatters";

export type ManualContactResult = {
  blocked?: boolean;
  reason?: string;
  next_valid_at?: string;
  contact?: {
    id?: string;
    status?: string;
  };
};

export type ContactFeedback = {
  variant: "success" | "warning" | "error";
  title: string;
  description: string;
};

const REASON_MESSAGES: Record<string, string> = {
  outside_hours:
    "No se puede contactar fuera del horario permitido por la normativa de cobranza.",
  awaiting_response:
    "Este deudor tiene un mensaje enviado y aún está dentro de la ventana de espera de respuesta.",
  retry_cooldown:
    "Este deudor está en espera del próximo reintento automático de contacto.",
  max_attempts_reached:
    "Se agotaron los intentos de contacto configurados sin obtener respuesta; la deuda fue escalada.",
  frequency_limit:
    "Ya se contactó a este deudor por este canal dentro del límite diario.",
  no_consent:
    "El deudor no tiene consentimiento activo para recibir mensajes por este canal.",
  opt_out_global:
    "El deudor tiene un opt-out global y no acepta contactos.",
  opt_out_channel: "El deudor rechazó contactos por este canal.",
  whatsapp_not_opted_in: "El deudor no tiene opt-in de WhatsApp activo.",
  debtor_not_found: "No se encontró el deudor asociado a esta deuda."
};

export function describeManualContactResult(
  data: ManualContactResult
): ContactFeedback {
  if (data.blocked) {
    const reason = data.reason ?? "restricted";
    const base =
      REASON_MESSAGES[reason] ??
      "El contacto no se pudo realizar por una restricción de compliance.";

    if (reason === "outside_hours" && data.next_valid_at) {
      return {
        variant: "warning",
        title: "Contacto programado",
        description: `${base} Se enviará automáticamente el ${formatDateTime(data.next_valid_at)}.`
      };
    }

    return {
      variant: "error",
      title: "Contacto no enviado",
      description: base
    };
  }

  return {
    variant: "success",
    title: "Contacto enviado",
    description: "El mensaje se envió correctamente."
  };
}

export function notifyManualContactResult(data: ManualContactResult): void {
  const feedback = describeManualContactResult(data);

  if (feedback.variant === "success") {
    toast.success(feedback.title, { description: feedback.description });
    return;
  }

  if (feedback.variant === "warning") {
    toast.warning(feedback.title, { description: feedback.description });
    return;
  }

  toast.error(feedback.title, { description: feedback.description });
}
