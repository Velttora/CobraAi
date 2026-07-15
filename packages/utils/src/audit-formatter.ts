export type AuditLogLike = {
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string | null;
  changes?: Record<string, unknown> | null;
};

export type ReadableAudit = {
  action: string;
  resource: string;
  resourceLabel: string;
  detail: string | null;
};

export type AuditActionFilterOption = {
  label: string;
  value: string;
};

const RESOURCE_LABELS: Record<string, string> = {
  debtor: "Deudor",
  debtors: "Deudor",
  debt: "Deuda",
  debts: "Deuda",
  portfolio: "Portafolio",
  portfolios: "Portafolio",
  payment: "Pago",
  payments: "Pago",
  contacts: "Contacto",
  contact: "Contacto",
  templates: "Plantilla",
  template: "Plantilla",
  tenant: "Organización",
  unknown: "Recurso"
};

const REASON_LABELS: Record<string, string> = {
  outside_hours: "fuera de horario permitido",
  awaiting_response: "esperando respuesta del intento anterior",
  retry_cooldown: "en espera del próximo reintento",
  max_attempts_reached: "se agotaron los intentos de contacto",
  frequency_limit: "límite de frecuencia",
  no_consent: "sin consentimiento",
  opt_out_global: "deudor con opt-out global",
  opt_out_channel: "opt-out en el canal",
  whatsapp_not_opted_in: "sin opt-in de WhatsApp",
  debtor_not_found: "deudor no encontrado"
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  voice: "Voz",
  email: "Email",
  sms: "SMS"
};

const ESCALATION_TARGET_LABELS: Record<string, string> = {
  legal_risk: "riesgo legal",
  human: "agente humano"
};

const HTTP_VERB_LABELS: Record<string, string> = {
  POST: "Creó",
  PATCH: "Actualizó",
  PUT: "Actualizó",
  DELETE: "Eliminó"
};

/** Opciones para filtrar la bandeja de auditoría (valor = substring en `action`). */
export const AUDIT_ACTION_FILTER_OPTIONS: AuditActionFilterOption[] = [
  { label: "Todas las acciones", value: "" },
  { label: "Contactos bloqueados", value: "compliance.contact.blocked" },
  { label: "Contactos permitidos", value: "compliance.contact.allowed" },
  { label: "Mensajes enviados", value: "compliance.contact.sent" },
  { label: "Envíos fallidos", value: "compliance.contact.send_failed" },
  { label: "Contactos efectivos", value: "compliance.contact.effective" },
  { label: "Sin contacto (sin respuesta)", value: "compliance.contact.no_response" },
  { label: "Reintentos programados", value: "compliance.contact.retry_scheduled" },
  { label: "Contactos escalados", value: "compliance.contact.escalated" },
  { label: "Consulta de datos de deudor", value: "debtor.sensitive_read" },
  { label: "Reembolsos de pago", value: "payment.refunded" },
  { label: "Creación de deudas", value: "POST /api/v1/debts" },
  { label: "Actualización de deudas", value: "PATCH /api/v1/debts" },
  { label: "Creación de deudores", value: "POST /api/v1/debtors" },
  { label: "Actualización de deudores", value: "PATCH /api/v1/debtors" },
  { label: "Creación de portafolios", value: "POST /api/v1/portfolios" },
  { label: "Actualización de portafolios", value: "PATCH /api/v1/portfolios" },
  { label: "Contactos manuales", value: "POST /api/v1/contacts" },
  { label: "Carga de datos demo", value: "seed.completed" }
];

export function normalizeAuditResourceType(resourceType: string): string {
  const key = resourceType.toLowerCase();
  const aliases: Record<string, string> = {
    debtors: "debtor",
    debts: "debt",
    portfolios: "portfolio",
    payments: "payment",
    contacts: "contact",
    templates: "template"
  };
  return aliases[key] ?? key;
}

function resourceKindLabel(resourceType: string): string {
  const normalized = normalizeAuditResourceType(resourceType);
  return RESOURCE_LABELS[normalized] ?? RESOURCE_LABELS[resourceType] ?? resourceType;
}

function channelLabel(channel: unknown): string | null {
  if (typeof channel !== "string" || !channel) return null;
  return CHANNEL_LABELS[channel] ?? channel;
}

function strChange(changes: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = changes?.[key];
  return typeof value === "string" ? value : undefined;
}

function numChange(changes: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const value = changes?.[key];
  return typeof value === "number" ? value : undefined;
}

/** "intento 2 de 3" — omite el total si no viene informado. */
function attemptLabel(changes: Record<string, unknown> | null | undefined): string | null {
  const attempt = numChange(changes, "attemptNumber");
  if (attempt === undefined) return null;
  const max = numChange(changes, "maxAttempts");
  return max ? `intento ${attempt} de ${max}` : `intento ${attempt}`;
}

export function describeAuditLog(row: AuditLogLike): ReadableAudit {
  const resource = resourceKindLabel(row.resourceType);
  const changes = row.changes ?? {};
  const resourceLabel = row.resourceName
    ? `${resource}: ${row.resourceName}`
    : resource;

  switch (row.action) {
    case "compliance.contact.blocked": {
      const reason = strChange(changes, "reason");
      const channel = channelLabel(changes.channel);
      return {
        action: "Contacto bloqueado",
        resource,
        resourceLabel,
        detail:
          [
            reason ? (REASON_LABELS[reason] ?? reason.replace(/_/g, " ")) : null,
            channel ? `canal ${channel}` : null
          ]
            .filter(Boolean)
            .join(" · ") || null
      };
    }
    case "compliance.contact.allowed": {
      const channel = channelLabel(changes.channel);
      return {
        action: "Contacto permitido",
        resource,
        resourceLabel,
        detail: channel ? `canal ${channel}` : null
      };
    }
    case "compliance.contact.sent": {
      const channel = channelLabel(changes.channel);
      const windowHours = numChange(changes, "windowHours");
      return {
        action: "Mensaje enviado",
        resource,
        resourceLabel,
        detail:
          [
            channel ? `canal ${channel}` : null,
            attemptLabel(changes),
            windowHours ? `espera respuesta ${windowHours}h` : null
          ]
            .filter(Boolean)
            .join(" · ") || null
      };
    }
    case "compliance.contact.send_failed": {
      const channel = channelLabel(changes.channel);
      return {
        action: "Envío fallido",
        resource,
        resourceLabel,
        detail:
          [channel ? `canal ${channel}` : null, attemptLabel(changes)]
            .filter(Boolean)
            .join(" · ") || null
      };
    }
    case "compliance.contact.effective": {
      const channel = channelLabel(strChange(changes, "respondedVia") ?? changes.channel);
      return {
        action: "Contacto efectivo",
        resource,
        resourceLabel,
        detail:
          [channel ? `respondió por ${channel}` : null, attemptLabel(changes)]
            .filter(Boolean)
            .join(" · ") || null
      };
    }
    case "compliance.contact.no_response": {
      const channel = channelLabel(changes.channel);
      return {
        action: "Sin contacto",
        resource,
        resourceLabel,
        detail:
          [
            channel ? `canal ${channel}` : null,
            attemptLabel(changes),
            "no hubo respuesta en la ventana de espera"
          ]
            .filter(Boolean)
            .join(" · ") || null
      };
    }
    case "compliance.contact.retry_scheduled": {
      const channel = channelLabel(changes.channel);
      return {
        action: "Reintento programado",
        resource,
        resourceLabel,
        detail:
          [channel ? `próximo canal ${channel}` : null, attemptLabel(changes)]
            .filter(Boolean)
            .join(" · ") || null
      };
    }
    case "compliance.contact.escalated": {
      const target = strChange(changes, "escalationTarget");
      const targetLabel = target ? (ESCALATION_TARGET_LABELS[target] ?? target) : null;
      return {
        action: "Contacto escalado",
        resource,
        resourceLabel,
        detail:
          [
            attemptLabel(changes) ? `agotó los intentos (${attemptLabel(changes)})` : "agotó los intentos de contacto",
            targetLabel ? `escaló a ${targetLabel}` : null
          ]
            .filter(Boolean)
            .join(" · ") || null
      };
    }
    case "debtor.sensitive_read":
      return {
        action: "Consultó datos del deudor",
        resource,
        resourceLabel,
        detail: null
      };
    case "payment.refunded":
      return {
        action: "Reembolsó un pago",
        resource,
        resourceLabel,
        detail: null
      };
    case "seed.completed":
      return {
        action: "Carga de datos demo",
        resource,
        resourceLabel,
        detail: null
      };
    default:
      break;
  }

  const verbMatch = /^(POST|PATCH|PUT|DELETE)\s+/.exec(row.action);
  if (verbMatch) {
    const verb = HTTP_VERB_LABELS[verbMatch[1]!] ?? "Modificó";
    return {
      action: `${verb} ${resource.toLowerCase()}`,
      resource,
      resourceLabel,
      detail: null
    };
  }

  return {
    action: row.action.replace(/_/g, " "),
    resource,
    resourceLabel,
    detail: null
  };
}
