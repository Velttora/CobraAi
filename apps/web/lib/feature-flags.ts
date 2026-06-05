function isEnabled(value: string | undefined): boolean {
  if (value === undefined) return false;
  return ["1", "true", "on", "yes"].includes(value.trim().toLowerCase());
}

/**
 * Flags de producto.
 * - workflowRuleCreation: muestra el botón para crear nuevas reglas
 *   (NEXT_PUBLIC_ENABLE_WORKFLOW_RULE_CREATION).
 * - sms: habilita el canal SMS. Mientras esté apagado, todo mensaje SMS se
 *   trata como WhatsApp (NEXT_PUBLIC_ENABLE_SMS).
 */
export const featureFlags = {
  workflowRuleCreation: isEnabled(
    process.env.NEXT_PUBLIC_ENABLE_WORKFLOW_RULE_CREATION
  ),
  sms: isEnabled(process.env.NEXT_PUBLIC_ENABLE_SMS)
};

/**
 * Mientras no haya servicio de SMS, cualquier canal "sms" se mapea a "whatsapp"
 * para envío y para mostrarse en la UI.
 */
export function resolveMessageChannel<T extends string | null | undefined>(
  channel: T
): T | "whatsapp" {
  if (!featureFlags.sms && channel === "sms") {
    return "whatsapp";
  }
  return channel;
}

/**
 * Reemplaza menciones de "SMS" en textos visibles (p. ej. nombres de reglas que
 * ya existen en la base de datos) mientras el canal SMS está deshabilitado.
 */
export function sanitizeChannelText(text: string): string {
  if (featureFlags.sms) return text;
  return text
    .replace(/\s*sin WhatsApp\s*(—|-)\s*SMS/gi, " — WhatsApp")
    .replace(/\bSMS\b/gi, "WhatsApp");
}
