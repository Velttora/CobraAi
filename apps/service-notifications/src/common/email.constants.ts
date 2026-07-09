/**
 * Reply-To de todos los emails salientes. Enruta las respuestas del deudor al
 * dominio de SendGrid Inbound Parse (reply.fogging.org), único destino que el
 * webhook `/v1/webhooks/sendgrid-inbound` acepta, para que el agente pueda
 * ingerir la respuesta y contestar. Debe ir en TODO email saliente —incluido el
 * primer contacto (recordatorio/notificación) y el link de pago—, no solo en las
 * respuestas del agente; si falta, la respuesta del deudor va al remitente y
 * nunca entra al pipeline.
 */
export const EMAIL_REPLY_TO = "reply@reply.fogging.org";
