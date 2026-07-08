import { channelLabel } from "./contact-channels";
import { resolveMessageChannel } from "./feature-flags";
import {
  APP_TIMEZONE,
  formatCurrency,
  formatDuration
} from "./formatters";

export type FormattedTimelineEvent = {
  title: string;
  description: string;
  meta: string[];
};

const CONTACT_STATUS: Record<string, string> = {
  scheduled: "Programado",
  in_progress: "En curso",
  completed: "Completado",
  failed: "Fallido",
  cancelled: "Cancelado"
};

const CONTACT_OUTCOME: Record<string, string> = {
  promise_made: "Promesa de pago",
  payment_received: "Pago recibido",
  no_answer: "Sin respuesta",
  refused: "Rechazó el contacto",
  voicemail: "Buzón de voz",
  wrong_number: "Número incorrecto",
  callback_requested: "Solicitó devolución de llamada"
};

/** Estado de respuesta del intento (independiente del envío/despacho, ver Contact.status). */
const RESPONSE_STATUS: Record<string, string> = {
  pending: "Mensaje enviado — esperando respuesta",
  effective: "Contacto efectivo",
  no_response: "Sin contacto"
};

const PROMISE_STATUS: Record<string, string> = {
  pending: "Pendiente",
  kept: "Cumplida",
  broken: "Incumplida",
  partial: "Parcial"
};

const PAYMENT_STATUS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  failed: "Fallido",
  refunded: "Reembolsado"
};

const PAYMENT_GATEWAY: Record<string, string> = {
  pse: "PSE",
  mercadopago: "Mercado Pago",
  pix: "PIX",
  spei: "SPEI",
  conekta: "Conekta",
  card: "Tarjeta",
  transfer: "Transferencia",
  cash: "Efectivo"
};

const WORKFLOW_STATUS: Record<string, string> = {
  pending: "Pendiente",
  running: "En ejecución",
  completed: "Completada",
  failed: "Fallida",
  skipped: "Omitida"
};

const WORKFLOW_ACTION: Record<string, string> = {
  send_notification: "Envío de notificación",
  escalate_human: "Escalamiento a humano",
  update_status: "Actualización de estado",
  assign_strategy: "Asignación de estrategia",
  create_task: "Creación de tarea"
};

const COMPLIANCE_REASON: Record<string, string> = {
  outside_hours: "Fuera de horario permitido",
  no_consent: "Sin consentimiento",
  awaiting_response: "Esperando respuesta del intento anterior",
  retry_cooldown: "En espera del próximo reintento",
  max_attempts_reached: "Se agotaron los intentos de contacto",
  frequency_limit: "Límite de frecuencia alcanzado",
  opt_out_global: "Deudor con opt-out global",
  opt_out_channel: "Deudor con opt-out en el canal",
  whatsapp_not_opted_in: "Sin opt-in de WhatsApp",
  debtor_not_found: "Deudor no encontrado"
};

function str(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" ? value : undefined;
}

function num(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function formatLocalDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CO", { timeZone: APP_TIMEZONE });
}

function eventTypeTitle(type: string): string {
  const labels: Record<string, string> = {
    contact: "Contacto",
    promise: "Promesa de pago",
    payment: "Pago",
    workflow: "Automatización"
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

function formatContactEvent(data: Record<string, unknown>): FormattedTimelineEvent {
  const channel = resolveMessageChannel(str(data, "channel"));
  const status = str(data, "status");
  const outcome = str(data, "outcome");
  const responseStatus = str(data, "responseStatus");
  const attemptNumber = num(data, "attemptNumber");
  const duration = num(data, "durationSeconds");
  const agentType = str(data, "agentType");

  const meta: string[] = [];
  if (status) meta.push(`Estado: ${CONTACT_STATUS[status] ?? status}`);
  if (responseStatus) {
    meta.push(RESPONSE_STATUS[responseStatus] ?? responseStatus);
  }
  if (attemptNumber) meta.push(`Intento ${attemptNumber}`);
  if (outcome) meta.push(`Resultado: ${CONTACT_OUTCOME[outcome] ?? outcome}`);
  if (duration) meta.push(`Duración: ${formatDuration(duration)}`);
  if (agentType) {
    meta.push(`Agente: ${agentType === "ai" ? "IA" : "Humano"}`);
  }

  const channelName = channel ? channelLabel(channel) : "canal desconocido";
  let description = `Intento de contacto por ${channelName}.`;

  if (status === "scheduled") {
    description = `Contacto programado por ${channelName}.`;
  } else if (status === "in_progress") {
    description = `Contacto en curso por ${channelName}.`;
  } else if (status === "failed") {
    description = `No se pudo completar el contacto por ${channelName}.`;
  } else if (status === "cancelled") {
    description = `Contacto cancelado por ${channelName}.`;
  } else if (outcome) {
    description = `Contacto por ${channelName}: ${CONTACT_OUTCOME[outcome] ?? outcome}.`;
  } else if (responseStatus === "effective") {
    description = `Contacto efectivo por ${channelName}: el deudor respondió.`;
  } else if (responseStatus === "no_response") {
    description = `Se envió mensaje por ${channelName}, pero el deudor no respondió.`;
  } else if (responseStatus === "pending") {
    description = `Mensaje enviado por ${channelName}, esperando respuesta.`;
  } else if (status === "completed") {
    description = `Contacto completado por ${channelName}.`;
  }

  return {
    title: "Contacto",
    description,
    meta
  };
}

function formatPromiseEvent(data: Record<string, unknown>): FormattedTimelineEvent {
  const amount = num(data, "amount");
  const currency = str(data, "currency") ?? "COP";
  const promisedDate = str(data, "promisedDate");
  const status = str(data, "status");
  const notes = str(data, "notes");

  const meta: string[] = [];
  if (notes?.trim()) meta.push(`Notas: ${notes.trim()}`);

  const amountText =
    amount !== undefined ? formatCurrency(amount, currency) : "monto no registrado";
  const dateText = promisedDate ? formatLocalDate(promisedDate) : "fecha no registrada";
  const statusText = status ? (PROMISE_STATUS[status] ?? status) : "sin estado";

  return {
    title: "Promesa de pago",
    description: `Compromiso de ${amountText} para el ${dateText} (${statusText}).`,
    meta
  };
}

function formatPaymentEvent(data: Record<string, unknown>): FormattedTimelineEvent {
  const amount = num(data, "amount");
  const currency = str(data, "currency") ?? "COP";
  const gateway = str(data, "gateway");
  const status = str(data, "status");
  const confirmedAt = str(data, "confirmedAt");

  const meta: string[] = [];
  if (confirmedAt) {
    meta.push(`Confirmado: ${formatLocalDate(confirmedAt)}`);
  }

  const amountText =
    amount !== undefined ? formatCurrency(amount, currency) : "monto no registrado";
  const gatewayText = gateway
    ? (PAYMENT_GATEWAY[gateway] ?? gateway)
    : "pasarela desconocida";
  const statusText = status ? (PAYMENT_STATUS[status] ?? status) : "sin estado";

  return {
    title: "Pago",
    description: `${amountText} vía ${gatewayText} (${statusText}).`,
    meta
  };
}

function formatWorkflowEvent(data: Record<string, unknown>): FormattedTimelineEvent {
  const status = str(data, "status");
  const result = asRecord(data.result);
  const meta: string[] = [];

  let description = "Regla de automatización ejecutada.";

  if (status) {
    meta.push(`Estado: ${WORKFLOW_STATUS[status] ?? status}`);
  }

  if (result) {
    const action = str(result, "action");
    const channel = resolveMessageChannel(str(result, "channel"));
    const blocked = result.blocked === true;
    const reason = str(result, "reason");
    const error = str(result, "error");

    if (action) {
      meta.push(`Acción: ${WORKFLOW_ACTION[action] ?? action}`);
    }
    if (channel) {
      meta.push(`Canal: ${channelLabel(channel)}`);
    }

    if (blocked && reason) {
      description = `Automatización omitida: ${COMPLIANCE_REASON[reason] ?? reason.replace(/_/g, " ")}.`;
    } else if (status === "failed" && error) {
      description = `Automatización fallida: ${error}`;
    } else if (action === "send_notification" && channel) {
      description = `Se solicitó un contacto por ${channelLabel(channel)} desde una regla.`;
    } else if (action === "escalate_human") {
      description = "La deuda fue escalada a un agente humano.";
    } else if (action === "update_status") {
      description = "Se actualizó el estado de la deuda automáticamente.";
    } else if (action === "assign_strategy") {
      description = "Se asignó una estrategia de cobranza.";
    } else if (action === "create_task") {
      description = "Se creó una tarea de seguimiento.";
    } else if (action) {
      description = `${WORKFLOW_ACTION[action] ?? action} ejecutada.`;
    }
  }

  return {
    title: "Automatización",
    description,
    meta
  };
}

export function formatTimelineEvent(
  type: string,
  data?: Record<string, unknown>
): FormattedTimelineEvent {
  if (!data || Object.keys(data).length === 0) {
    return {
      title: eventTypeTitle(type),
      description: "Sin detalles adicionales.",
      meta: []
    };
  }

  switch (type) {
    case "contact":
      return formatContactEvent(data);
    case "promise":
      return formatPromiseEvent(data);
    case "payment":
      return formatPaymentEvent(data);
    case "workflow":
      return formatWorkflowEvent(data);
    default:
      return {
        title: eventTypeTitle(type),
        description: "Evento registrado en la deuda.",
        meta: []
      };
  }
}
