/**
 * Catálogo de variables disponibles en los mensajes de contacto.
 *
 * Estas claves se reemplazan en el backend al enviar el mensaje
 * (ver `buildVariables` en apps/service-notifications/src/contacts/contacts.service.ts).
 * Cualquier variable nueva debe agregarse en AMBOS lugares para que funcione.
 *
 * El `sample` se usa para el botón de "Preview" del editor.
 */

export type TemplateVariable = {
  /** Clave que se escribe entre llaves dobles, ej: {{nombre}} */
  key: string;
  /** Descripción legible para el usuario */
  label: string;
  /** Valor de ejemplo para la vista previa */
  sample: string;
};

export type TemplateVariableGroup = {
  category: string;
  variables: TemplateVariable[];
};

export const TEMPLATE_VARIABLE_GROUPS: TemplateVariableGroup[] = [
  {
    category: "Deudor",
    variables: [
      { key: "nombre", label: "Nombre del deudor", sample: "María López" },
      { key: "debtor_name", label: "Nombre del deudor (alias)", sample: "María López" },
      { key: "empresa", label: "Nombre de tu empresa", sample: "CobraAI" }
    ]
  },
  {
    category: "Financiero",
    variables: [
      { key: "monto", label: "Saldo pendiente (número)", sample: "1250000" },
      {
        key: "monto_formato",
        label: "Saldo pendiente con formato y moneda",
        sample: "1.250.000 COP"
      },
      { key: "monto_original", label: "Monto original de la deuda", sample: "1500000" },
      { key: "moneda", label: "Moneda (ISO)", sample: "COP" },
      { key: "amount", label: "Saldo pendiente (alias en inglés)", sample: "1250000" },
      { key: "dias_mora", label: "Días en mora", sample: "23" },
      { key: "installments", label: "Cuotas sugeridas", sample: "3" },
      { key: "days", label: "Días de plazo", sample: "15" }
    ]
  },
  {
    category: "Fechas",
    variables: [
      { key: "fecha_vencimiento", label: "Fecha de vencimiento (DD/MM/AAAA)", sample: "15/05/2026" },
      { key: "due_date", label: "Fecha de vencimiento (ISO)", sample: "2026-05-15T00:00:00.000Z" }
    ]
  },
  {
    category: "Pago",
    variables: [
      { key: "link_pago", label: "Link de pago", sample: "https://pay.cobrai.dev/abc" },
      { key: "payment_link", label: "Link de pago (alias)", sample: "https://pay.cobrai.dev/abc" },
      { key: "link", label: "Link de pago (alias corto)", sample: "https://pay.cobrai.dev/abc" },
      { key: "external_ref", label: "Referencia externa de la deuda", sample: "FAC-00123" }
    ]
  },
  {
    category: "Descuento pronto pago",
    variables: [
      {
        key: "discount_percentage",
        label: "Porcentaje de descuento pronto pago",
        sample: "5"
      },
      {
        key: "descuento_pronto_pago",
        label: "Descuento pronto pago con símbolo",
        sample: "5%"
      },
      {
        key: "discount_amount",
        label: "Valor del descuento (número)",
        sample: "62500"
      },
      {
        key: "discount_amount_formato",
        label: "Valor del descuento con formato y moneda",
        sample: "62.500 COP"
      },
      {
        key: "discount_final_amount",
        label: "Saldo con descuento aplicado (número)",
        sample: "1187500"
      },
      {
        key: "discount_final_amount_formato",
        label: "Saldo con descuento con formato y moneda",
        sample: "1.187.500 COP"
      },
      {
        key: "discount_expiration_date",
        label: "Fecha límite del descuento (ISO)",
        sample: "2026-05-30"
      },
      {
        key: "fecha_limite_pronto_pago",
        label: "Fecha límite del descuento (DD/MM/AAAA)",
        sample: "30/05/2026"
      },
      {
        key: "discount_enabled",
        label: "¿Tiene descuento pronto pago? (true/false)",
        sample: "true"
      }
    ]
  }
];

/** Mapa plano clave → valor de ejemplo, para la vista previa. */
export const TEMPLATE_VARIABLE_SAMPLES: Record<string, string> =
  TEMPLATE_VARIABLE_GROUPS.reduce<Record<string, string>>((acc, group) => {
    for (const v of group.variables) acc[v.key] = v.sample;
    return acc;
  }, {});
