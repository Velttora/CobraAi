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
  weekly_limit: "límite semanal alcanzado",
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
