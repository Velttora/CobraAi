import {
  AVAILABLE_EMAIL_VARIABLES,
  type EmailBlock,
  type EmailBlockType
} from "@cobrai/utils/email-layout";

export type PaletteItem = {
  type: EmailBlockType;
  label: string;
  hint: string;
};

/** Bloques disponibles en la paleta (orden de aparición). */
export const PALETTE: PaletteItem[] = [
  { type: "logo", label: "Logo", hint: "Imagen de tu marca" },
  { type: "heading", label: "Encabezado", hint: "Título o barra de marca" },
  { type: "text", label: "Texto", hint: "Párrafo con variables" },
  { type: "body", label: "Cuerpo del mensaje", hint: "Aquí entra el mensaje de la regla" },
  { type: "button", label: "Botón", hint: "Llamado a la acción (pago)" },
  { type: "image", label: "Imagen", hint: "Imagen de ancho completo" },
  { type: "divider", label: "Divisor", hint: "Línea separadora" },
  { type: "spacer", label: "Espacio", hint: "Separación vertical" },
  { type: "social", label: "Redes", hint: "Enlaces a redes sociales" },
  { type: "signature", label: "Firma", hint: "Firma reutilizable del tenant" }
];

export const BLOCK_LABELS: Record<EmailBlockType, string> = Object.fromEntries(
  PALETTE.map((p) => [p.type, p.label])
) as Record<EmailBlockType, string>;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `block-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

const DEFAULT_PROPS: Record<EmailBlockType, Record<string, unknown>> = {
  logo: { src: "", alt: "Logo", width: 160, align: "left" },
  heading: { text: "Título", level: 2, align: "left" },
  text: { text: "Escribe tu mensaje. Puedes usar variables como {{nombre}}.", align: "left" },
  body: {},
  button: { text: "Pagar ahora", href: "{{link_pago}}", align: "center" },
  image: { src: "", alt: "", width: 552, align: "center" },
  divider: {},
  spacer: { height: 24 },
  social: { align: "center" },
  signature: {}
};

/** Crea un bloque nuevo con props por defecto y un id único. */
export function createBlock(type: EmailBlockType): EmailBlock {
  return { id: uuid(), type, props: { ...DEFAULT_PROPS[type] } };
}

/** Variables de muestra para el preview (key → ejemplo). */
export const SAMPLE_VARIABLES: Record<string, string> = Object.fromEntries(
  AVAILABLE_EMAIL_VARIABLES.map((v) => [v.key, v.sample])
);

/** Cuerpo de muestra que ocupa el lugar del mensaje de la regla en el preview. */
export const SAMPLE_BODY =
  "Le recordamos de manera cordial que registra un saldo pendiente. " +
  "Queremos ayudarle a resolverlo de la forma más conveniente para usted.\n\n" +
  "Si ya realizó el pago, ignore este mensaje.";
