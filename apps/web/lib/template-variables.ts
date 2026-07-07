/**
 * Variables de plantilla para el editor web.
 * Fuente canónica: @cobrai/utils/template-variables
 */
import {
  buildTemplateVariableSamples,
  groupTemplateVariables,
  TEMPLATE_VARIABLE_CATALOG
} from "@cobrai/utils/template-variables";

export type TemplateVariable = {
  key: string;
  label: string;
  sample: string;
};

export type TemplateVariableGroup = {
  category: string;
  variables: TemplateVariable[];
};

export const TEMPLATE_VARIABLE_GROUPS: TemplateVariableGroup[] =
  groupTemplateVariables();

export const TEMPLATE_VARIABLE_SAMPLES: Record<string, string> =
  buildTemplateVariableSamples();

/** Alias soportados en envío pero no listados como chips (referencia para soporte). */
export const TEMPLATE_VARIABLE_LEGACY_ALIASES = [
  "debtor_name → nombre",
  "amount → monto",
  "external_ref → referencia",
  "payment_link / link → link_pago",
  "due_date → fecha_vencimiento"
] as const;

// Re-export por si otros módulos web necesitan el catálogo plano
export { TEMPLATE_VARIABLE_CATALOG };
