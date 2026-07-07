/**
 * Catálogo canónico de variables para plantillas de contacto.
 *
 * El backend (`buildVariables` en service-notifications) sigue exponiendo alias
 * en inglés o técnicos para plantillas existentes; aquí solo listamos las que
 * mostramos al usuario al editar mensajes.
 */

export type TemplateVariableDescriptor = {
  key: string;
  label: string;
  sample: string;
  category: string;
};

/** Variables recomendadas en el editor (sin duplicados). */
export const TEMPLATE_VARIABLE_CATALOG: TemplateVariableDescriptor[] = [
  { category: "Deudor", key: "nombre", label: "Nombre del deudor", sample: "María López" },
  { category: "Deudor", key: "empresa", label: "Nombre de tu empresa", sample: "CobraAI" },

  {
    category: "Deuda",
    key: "referencia",
    label: "Referencia de la deuda (factura, contrato, crédito)",
    sample: "FAC-00123"
  },

  {
    category: "Financiero",
    key: "monto_formato",
    label: "Saldo pendiente con formato y moneda",
    sample: "1.250.000 COP"
  },
  { category: "Financiero", key: "monto", label: "Saldo pendiente (solo número)", sample: "1250000" },
  {
    category: "Financiero",
    key: "monto_original",
    label: "Monto original de la deuda",
    sample: "1500000"
  },
  { category: "Financiero", key: "moneda", label: "Moneda (ISO)", sample: "COP" },
  { category: "Financiero", key: "dias_mora", label: "Días en mora", sample: "23" },
  { category: "Financiero", key: "installments", label: "Número de cuotas sugeridas", sample: "3" },

  {
    category: "Fechas",
    key: "fecha_vencimiento",
    label: "Fecha de vencimiento (DD/MM/AAAA)",
    sample: "15/05/2026"
  },

  { category: "Pago", key: "link_pago", label: "Enlace de pago", sample: "https://pay.cobrai.dev/abc" },

  {
    category: "Descuento pronto pago",
    key: "descuento_pronto_pago",
    label: "Porcentaje de descuento (con símbolo %)",
    sample: "5%"
  },
  {
    category: "Descuento pronto pago",
    key: "discount_amount_formato",
    label: "Valor del descuento con formato",
    sample: "62.500 COP"
  },
  {
    category: "Descuento pronto pago",
    key: "discount_final_amount_formato",
    label: "Saldo con descuento aplicado (formato)",
    sample: "1.187.500 COP"
  },
  {
    category: "Descuento pronto pago",
    key: "fecha_limite_pronto_pago",
    label: "Fecha límite del descuento",
    sample: "30/05/2026"
  },
  {
    category: "Descuento pronto pago",
    key: "discount_enabled",
    label: "¿Tiene descuento activo? (true/false)",
    sample: "true"
  }
];

/**
 * Alias que el backend sigue resolviendo pero no mostramos como chips
 * (plantillas antiguas o integraciones).
 */
export const TEMPLATE_VARIABLE_ALIAS_SAMPLES: Record<string, string> = {
  debtor_name: "María López",
  amount: "1250000",
  external_ref: "FAC-00123",
  payment_link: "https://pay.cobrai.dev/abc",
  link: "https://pay.cobrai.dev/abc",
  due_date: "2026-05-15T00:00:00.000Z",
  discount_percentage: "5",
  discount_amount: "62500",
  discount_final_amount: "1187500",
  discount_expiration_date: "2026-05-30",
  days: "15"
};

export type TemplateVariableGroup = {
  category: string;
  variables: Array<Pick<TemplateVariableDescriptor, "key" | "label" | "sample">>;
};

export function groupTemplateVariables(
  catalog: TemplateVariableDescriptor[] = TEMPLATE_VARIABLE_CATALOG
): TemplateVariableGroup[] {
  const groups = new Map<string, TemplateVariableGroup>();
  for (const item of catalog) {
    const group = groups.get(item.category) ?? { category: item.category, variables: [] };
    group.variables.push({ key: item.key, label: item.label, sample: item.sample });
    groups.set(item.category, group);
  }
  return [...groups.values()];
}

export function buildTemplateVariableSamples(
  catalog: TemplateVariableDescriptor[] = TEMPLATE_VARIABLE_CATALOG,
  aliases: Record<string, string> = TEMPLATE_VARIABLE_ALIAS_SAMPLES
): Record<string, string> {
  const samples: Record<string, string> = { ...aliases };
  for (const item of catalog) {
    samples[item.key] = item.sample;
  }
  return samples;
}

/** Subconjunto para el editor de layout de correo (bloques drag-and-drop). */
export const EMAIL_LAYOUT_VARIABLE_KEYS = [
  "nombre",
  "empresa",
  "referencia",
  "monto_formato",
  "link_pago",
  "fecha_vencimiento"
] as const;

export function emailLayoutVariables(
  catalog: TemplateVariableDescriptor[] = TEMPLATE_VARIABLE_CATALOG
): Array<Pick<TemplateVariableDescriptor, "key" | "label" | "sample">> {
  const byKey = new Map(catalog.map((item) => [item.key, item]));
  return EMAIL_LAYOUT_VARIABLE_KEYS.map((key) => {
    const item = byKey.get(key);
    if (!item) {
      throw new Error(`Missing email layout variable: ${key}`);
    }
    return { key: item.key, label: item.label, sample: item.sample };
  });
}
