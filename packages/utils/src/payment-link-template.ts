/**
 * Single-brace external payment link template resolver (D-13).
 *
 * Deliberately separate from the repo's other, pre-existing double-brace
 * (`{{variable}}`) template/preview system (UI-SPEC assumption A-07). The two
 * systems are NOT unified: this module resolves only `{monto}`, `{ref}` and
 * `{nombre}` for the tenant-authored external payment link, leaving any
 * `{{doble}}` token untouched. Unifying the two placeholder vocabularies is a
 * product decision explicitly deferred outside this phase.
 */

export const EXTERNAL_LINK_VARIABLES = ["monto", "ref", "nombre"] as const;

export type ExternalLinkVariable = (typeof EXTERNAL_LINK_VARIABLES)[number];

export interface ExternalLinkValues {
  /** Plain number as string, e.g. "450000" — no thousands separators, no currency symbol. */
  monto: string;
  /** Debt.externalRef, falling back to PaymentLink.token. */
  ref: string;
  /** Debtor.name. */
  nombre: string;
}

const KNOWN_VARIABLES = new Set<string>(EXTERNAL_LINK_VARIABLES);

// Matches a single-brace token (e.g. `{monto}`) while leaving double-brace
// tokens (e.g. `{{referencia}}`) untouched. A negative lookbehind for `{`
// and a negative lookahead for `}` reject any brace that has a sibling brace
// immediately outside it, which is exactly the double-brace case.
const SINGLE_BRACE_TOKEN = /(?<!\{)\{([a-zA-Z_][\w]*)\}(?!\})/g;

/**
 * Replaces every recognized single-brace token with the URL-encoded value.
 * Unknown single-brace tokens are left verbatim so a typo is visible instead
 * of silently disappearing. Double-brace tokens (the other template system)
 * are never matched.
 */
export function resolveExternalLinkTemplate(template: string, values: ExternalLinkValues): string {
  return template.replace(SINGLE_BRACE_TOKEN, (match, name: string) => {
    if (!KNOWN_VARIABLES.has(name)) {
      return match;
    }
    return encodeURIComponent(values[name as ExternalLinkVariable]);
  });
}

export interface ExternalLinkTemplateError {
  code: "not_https" | "no_reference" | "unknown_variable";
  message: string;
  variable?: string;
}

/**
 * Validates a tenant-authored external link template. Error copy is taken
 * verbatim from UI-SPEC "ExternalLinkTemplateEditor" — the frontend renders
 * these strings directly.
 */
export function validateExternalLinkTemplate(template: string): ExternalLinkTemplateError[] {
  const errors: ExternalLinkTemplateError[] = [];

  if (!template.startsWith("https://")) {
    errors.push({ code: "not_https", message: "El enlace debe empezar con https://" });
  }

  const foundVariables = new Set<string>();
  for (const match of template.matchAll(SINGLE_BRACE_TOKEN)) {
    const name = match[1];
    if (name) foundVariables.add(name);
  }

  if (!foundVariables.has("ref") && !foundVariables.has("monto")) {
    errors.push({
      code: "no_reference",
      message: "Incluye al menos {ref} para poder identificar el pago."
    });
  }

  for (const name of foundVariables) {
    if (!KNOWN_VARIABLES.has(name)) {
      errors.push({
        code: "unknown_variable",
        message: `No reconocemos {${name}}. Variables válidas: {monto}, {ref}, {nombre}.`,
        variable: name
      });
    }
  }

  return errors;
}
