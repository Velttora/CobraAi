/**
 * Screen 2 provider data (08-UI-SPEC.md "Screen 2 — Configuración de cobro").
 *
 * Field names below are the exact `publicConfig`/`secrets` keys the backend
 * expects. Cross-checked against two sources: 08-14-SUMMARY.md's "Final
 * Endpoint List" (credential fields for wompi/payu/epayco/mercadopago/
 * stripe/external_link/transfer) and, for the two webhook-signing-secret
 * fields 08-14-SUMMARY.md does not enumerate (wompi's events secret,
 * stripe's/mercadopago's webhook secret), against
 * `apps/service-payments/src/webhooks/webhook-validator.service.ts`'s
 * `SIGNING_SECRET_FIELD` map — the actual runtime consumer of those two
 * fields, which confirms `secrets.eventsSecret` (wompi) and
 * `secrets.webhookSecret` (stripe, mercadopago). `savePayment` in
 * `integrations.service.ts` passes `publicConfig`/`secrets` through to
 * `TenantIntegrationService.upsert` with no field allowlist, so these two
 * extra fields are accepted and stored exactly like every other field here.
 * Sending the wrong key silently stores a credential under a field the
 * backend never reads, so this map is the single source of truth for every
 * provider form on this screen.
 */

export interface PaymentFieldDescriptor {
  /** The exact `publicConfig`/`secrets` key the backend expects. */
  name: string;
  label: string;
  secret: boolean;
  target: "publicConfig" | "secrets";
}

export interface PaymentProviderOption {
  value: string;
  label: string;
}

export const COLOMBIAN_PROVIDER_OPTIONS: PaymentProviderOption[] = [
  { value: "wompi", label: "Wompi (Bancolombia)" },
  { value: "payu", label: "PayU Colombia" },
  { value: "epayco", label: "ePayco" },
  { value: "mercadopago", label: "Mercado Pago Colombia" }
];

export const INTERNATIONAL_PROVIDER_OPTIONS: PaymentProviderOption[] = [
  { value: "stripe", label: "Stripe" }
];

export const NO_INTEGRATION_PROVIDER_OPTIONS: PaymentProviderOption[] = [
  { value: "external_link", label: "Enlace externo (Bold, Nequi, link propio)" },
  { value: "transfer", label: "Transferencia bancaria" }
];

export const ALL_PAYMENT_PROVIDER_OPTIONS: PaymentProviderOption[] = [
  ...COLOMBIAN_PROVIDER_OPTIONS,
  ...INTERNATIONAL_PROVIDER_OPTIONS,
  ...NO_INTEGRATION_PROVIDER_OPTIONS
];

/**
 * Precedence `TenantIntegrationService.resolveByChannel` uses to pick the
 * provider actually used at checkout (first verified match, in
 * `PROVIDER_CHANNEL` insertion order) — mirrored here so this panel's
 * default selection matches what checkout really resolves to when more than
 * one payment provider row happens to be configured.
 */
export const PAYMENT_PROVIDER_PRECEDENCE = [
  "stripe",
  "wompi",
  "payu",
  "epayco",
  "mercadopago",
  "external_link",
  "transfer"
] as const;

/** Providers with no credential form at all — `external_link` uses the template editor, `transfer` is plaintext-only but still has fields. */
export const NO_CREDENTIAL_PROVIDERS = new Set(["external_link"]);

/** Providers whose integration view can carry a `webhookUrl` (08-UI-SPEC provider table, "Webhook?" column). */
export const WEBHOOK_CAPABLE_PROVIDERS = new Set(["wompi", "payu", "epayco", "mercadopago", "stripe"]);

/** Short display names for inline copy (`Pega esta URL en la consola de {proveedor}…`, generic remedy). */
export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  wompi: "Wompi",
  payu: "PayU",
  epayco: "ePayco",
  mercadopago: "Mercado Pago",
  stripe: "Stripe",
  external_link: "el enlace externo",
  transfer: "la transferencia bancaria"
};

export const PAYMENT_PROVIDER_FIELDS: Record<string, PaymentFieldDescriptor[]> = {
  wompi: [
    { name: "publicKey", label: "Llave pública", secret: false, target: "publicConfig" },
    { name: "privateKey", label: "Llave privada", secret: true, target: "secrets" },
    { name: "eventsSecret", label: "Secreto de eventos", secret: true, target: "secrets" }
  ],
  payu: [
    { name: "merchantId", label: "Merchant ID", secret: false, target: "publicConfig" },
    { name: "accountId", label: "Account ID", secret: false, target: "publicConfig" },
    { name: "apiKey", label: "API Key", secret: true, target: "secrets" },
    { name: "apiLogin", label: "API Login", secret: true, target: "secrets" }
  ],
  epayco: [
    { name: "custIdCliente", label: "P_CUST_ID_CLIENTE", secret: false, target: "publicConfig" },
    { name: "publicKey", label: "Llave pública", secret: false, target: "publicConfig" },
    { name: "pKey", label: "P_KEY", secret: true, target: "secrets" }
  ],
  mercadopago: [
    { name: "accessToken", label: "Access token", secret: true, target: "secrets" },
    { name: "webhookSecret", label: "Secreto de webhook", secret: true, target: "secrets" }
  ],
  stripe: [
    { name: "secretKey", label: "Clave secreta", secret: true, target: "secrets" },
    { name: "webhookSecret", label: "Secreto de webhook", secret: true, target: "secrets" }
  ],
  transfer: [
    { name: "bank", label: "Banco", secret: false, target: "publicConfig" },
    { name: "accountType", label: "Tipo de cuenta", secret: false, target: "publicConfig" },
    { name: "accountNumber", label: "Número de cuenta", secret: false, target: "publicConfig" },
    { name: "accountHolder", label: "Titular", secret: false, target: "publicConfig" },
    { name: "taxId", label: "NIT", secret: false, target: "publicConfig" }
  ]
  // external_link has no credential fields — publicConfig.template is driven
  // by ExternalLinkTemplateEditor instead (see PaymentGatewayPanel).
};

/** Full select-option label (e.g. `Wompi (Bancolombia)`), used by the read-only `<dl>` and the provider-change dialog copy. */
export function providerLabel(provider: string): string {
  return ALL_PAYMENT_PROVIDER_OPTIONS.find((o) => o.value === provider)?.label ?? provider;
}

/** Short display name for inline sentences (`Pega esta URL en la consola de {proveedor}…`). */
export function displayNameFor(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider] ?? provider;
}

/** The credential field's label for a given provider/field-name pair, used by the non-admin read-only view. */
export function fieldLabelFor(provider: string, fieldName: string): string {
  return PAYMENT_PROVIDER_FIELDS[provider]?.find((f) => f.name === fieldName)?.label ?? fieldName;
}

/** Copy matrix — verification failure messages (verbatim from UI-SPEC "Copy matrix — Screen 2"). */
export function providerRemedyMessage(provider: string): string {
  if (provider === "wompi") {
    return "Wompi rechazó las llaves. Revisa que sean las de producción y no las de sandbox, y que la cuenta esté activa.";
  }
  if (provider === "stripe") {
    return "Stripe rechazó la clave. Revisa que sea una clave secreta (empieza por sk_) y no una publicable.";
  }
  const name = PROVIDER_DISPLAY_NAMES[provider] ?? provider;
  return `${name} rechazó las credenciales. Cópialas de nuevo desde el panel de ${name} y vuelve a intentar.`;
}
