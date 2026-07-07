/**
 * Renderizador compartido del "shell" de correo por tenant.
 *
 * FUENTE ÚNICA DE VERDAD: tanto el preview del editor drag-and-drop (web) como
 * el envío real (service-notifications) usan `renderEmailLayout`, de modo que
 * lo que el tenant ve al diseñar es exactamente lo que recibe el deudor.
 *
 * El cuerpo del correo NO vive aquí: lo aporta el mensaje de cada regla
 * (`NotificationTemplate.content` ya renderizado) y se inyecta en el bloque
 * `body`. Este módulo solo define la estructura/identidad del tenant.
 *
 * HTML email-safe: tablas anidadas, estilos inline, ancho fijo (~600px),
 * fuentes web-safe. Sin CSS externo ni clases.
 */

import {
  emailLayoutVariables,
  type TemplateVariableDescriptor
} from "./template-variables";

export type EmailBlockType =
  | "logo"
  | "heading"
  | "text"
  | "body"
  | "button"
  | "divider"
  | "spacer"
  | "image"
  | "social"
  | "signature";

export type EmailBlockAlign = "left" | "center" | "right";

export interface EmailBlock {
  id: string;
  type: EmailBlockType;
  /** Props específicas por tipo; se leen de forma defensiva al renderizar. */
  props: Record<string, unknown>;
}

export interface EmailLayoutSettings {
  brandColor: string;
  backgroundColor: string;
  contentWidth: number;
  fontFamily: string;
}

export interface EmailSocialLink {
  type: string;
  url: string;
}

export interface EmailSignature {
  companyName?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  website?: string;
  socials?: EmailSocialLink[];
  legalDisclaimer?: string;
}

export interface EmailLayoutConfig {
  blocks: EmailBlock[];
  settings: EmailLayoutSettings;
  signature: EmailSignature;
}

export interface RenderEmailContext {
  /** Cuerpo del mensaje de la regla, ya con variables sustituidas (texto plano). */
  body: string;
  /** Variables disponibles para sustituir `{{var}}` en bloques del shell. */
  variables: Record<string, string>;
}

export type EmailVariableDescriptor = Pick<
  TemplateVariableDescriptor,
  "key" | "label" | "sample"
>;

export const DEFAULT_BRAND_COLOR = "#D85A30";

export const DEFAULT_EMAIL_SETTINGS: EmailLayoutSettings = {
  brandColor: DEFAULT_BRAND_COLOR,
  backgroundColor: "#f4f4f5",
  contentWidth: 600,
  fontFamily: "Arial, Helvetica, sans-serif"
};

/**
 * Variables que el orquestador de contactos expone (ver `buildVariables` en
 * service-notifications). El editor las ofrece como chips de inserción.
 */
export const AVAILABLE_EMAIL_VARIABLES: EmailVariableDescriptor[] =
  emailLayoutVariables();

/** Disclaimer legal por defecto (Ley 1266 de 2008 — Habeas Data, Colombia). */
const DEFAULT_LEGAL_DISCLAIMER =
  "Gestión de cobranza conforme a la Ley 1266 de 2008 (Habeas Data). " +
  "Si no desea recibir más comunicaciones, responda este correo solicitando su exclusión.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Sustituye `{{var}}` por su valor (sin escapar todavía). */
function substitute(content: string, variables: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

/**
 * Sustituye variables y escapa para contexto HTML de texto.
 * Anti-inyección: los valores (datos del deudor) quedan escapados.
 */
function renderInlineText(raw: string, variables: Record<string, string>): string {
  return escapeHtml(substitute(raw, variables));
}

/** Igual que `renderInlineText` pero conserva saltos de línea como <br />. */
function renderMultilineText(raw: string, variables: Record<string, string>): string {
  return renderInlineText(raw, variables).replace(/\r?\n/g, "<br />");
}

/** Sustituye variables y escapa para un atributo (href/src). */
function renderAttr(raw: string, variables: Record<string, string>): string {
  return escapeHtml(substitute(raw, variables));
}

function str(props: Record<string, unknown>, key: string, fallback = ""): string {
  const v = props[key];
  return typeof v === "string" ? v : fallback;
}

function num(props: Record<string, unknown>, key: string, fallback: number): number {
  const v = props[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function align(props: Record<string, unknown>, fallback: EmailBlockAlign = "left"): EmailBlockAlign {
  const v = props.align;
  return v === "left" || v === "center" || v === "right" ? v : fallback;
}

/** Envuelve el contenido de un bloque en una fila de la tabla central. */
function row(inner: string, padding = "0 24px"): string {
  return `<tr><td style="padding:${padding}">${inner}</td></tr>`;
}

// ---------------------------------------------------------------------------
// Render por tipo de bloque
// ---------------------------------------------------------------------------

function renderLogo(block: EmailBlock, vars: Record<string, string>): string {
  const src = renderAttr(str(block.props, "src"), vars);
  if (!src) return "";
  const alt = renderAttr(str(block.props, "alt", "logo"), vars);
  const width = num(block.props, "width", 160);
  const a = align(block.props, "left");
  const img = `<img src="${src}" alt="${alt}" width="${width}" style="display:block;border:0;outline:none;max-width:100%;height:auto" />`;
  const link = renderAttr(str(block.props, "link"), vars);
  const content = link ? `<a href="${link}" target="_blank">${img}</a>` : img;
  return row(`<div style="text-align:${a}">${content}</div>`, "24px 24px 8px");
}

function renderHeading(block: EmailBlock, settings: EmailLayoutSettings, vars: Record<string, string>): string {
  const text = renderMultilineText(str(block.props, "text"), vars);
  if (!text) return "";
  const level = num(block.props, "level", 2);
  const tag = level === 1 ? "h1" : level === 3 ? "h3" : "h2";
  const size = level === 1 ? 24 : level === 3 ? 16 : 20;
  const a = align(block.props, "left");
  // Barra con color de fondo (header de marca) si se define `backgroundColor`.
  const bg = str(block.props, "backgroundColor");
  const color = str(block.props, "color", bg ? "#ffffff" : "#1a1a1a");
  const heading = `<${tag} style="margin:0;font-family:${settings.fontFamily};font-size:${size}px;line-height:1.3;color:${color};text-align:${a};font-weight:700">${text}</${tag}>`;
  if (bg) {
    return `<tr><td style="background:${bg};padding:18px 24px">${heading}</td></tr>`;
  }
  return row(heading, "8px 24px");
}

function renderText(block: EmailBlock, settings: EmailLayoutSettings, vars: Record<string, string>): string {
  const text = renderMultilineText(str(block.props, "text"), vars);
  if (!text) return "";
  const color = str(block.props, "color", "#333333");
  const size = num(block.props, "fontSize", 15);
  const a = align(block.props, "left");
  return row(
    `<p style="margin:0;font-family:${settings.fontFamily};font-size:${size}px;line-height:1.6;color:${color};text-align:${a}">${text}</p>`,
    "8px 24px"
  );
}

/** Inyecta el cuerpo del mensaje de la regla (texto plano → párrafos). */
function renderBody(settings: EmailLayoutSettings, body: string): string {
  const safe = escapeHtml(body).trim();
  const paragraphs = safe
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\r?\n/g, "<br />"))
    .filter((p) => p.length > 0);
  const html = (paragraphs.length > 0 ? paragraphs : [""])
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:${settings.fontFamily};font-size:15px;line-height:1.6;color:#333333">${p}</p>`
    )
    .join("");
  return row(html, "8px 24px");
}

function renderButton(block: EmailBlock, settings: EmailLayoutSettings, vars: Record<string, string>): string {
  const label = renderInlineText(str(block.props, "text", "Pagar ahora"), vars);
  const href = renderAttr(str(block.props, "href", "{{link_pago}}"), vars);
  if (!href) return "";
  const bg = str(block.props, "bgColor", settings.brandColor);
  const color = str(block.props, "textColor", "#ffffff");
  const radius = num(block.props, "borderRadius", 6);
  const a = align(block.props, "center");
  return row(
    `<div style="text-align:${a}"><a href="${href}" target="_blank" style="background:${bg};color:${color};font-family:${settings.fontFamily};font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:${radius}px;display:inline-block">${label}</a></div>`,
    "16px 24px"
  );
}

function renderDivider(block: EmailBlock): string {
  const color = str(block.props, "color", "#eeeeee");
  const thickness = num(block.props, "thickness", 1);
  return row(
    `<div style="border-top:${thickness}px solid ${color};font-size:0;line-height:0">&nbsp;</div>`,
    "12px 24px"
  );
}

function renderSpacer(block: EmailBlock): string {
  const height = num(block.props, "height", 24);
  return `<tr><td style="height:${height}px;font-size:0;line-height:0">&nbsp;</td></tr>`;
}

function renderImage(block: EmailBlock, vars: Record<string, string>): string {
  const src = renderAttr(str(block.props, "src"), vars);
  if (!src) return "";
  const alt = renderAttr(str(block.props, "alt", ""), vars);
  const width = num(block.props, "width", 552);
  const a = align(block.props, "center");
  const img = `<img src="${src}" alt="${alt}" width="${width}" style="display:inline-block;border:0;outline:none;max-width:100%;height:auto" />`;
  const link = renderAttr(str(block.props, "link"), vars);
  const content = link ? `<a href="${link}" target="_blank">${img}</a>` : img;
  return row(`<div style="text-align:${a}">${content}</div>`, "8px 24px");
}

function renderSocialLinks(socials: EmailSocialLink[], settings: EmailLayoutSettings, a: EmailBlockAlign): string {
  const valid = socials.filter((s) => s && typeof s.url === "string" && s.url.trim().length > 0);
  if (valid.length === 0) return "";
  const links = valid
    .map((s) => {
      const url = escapeHtml(s.url);
      const label = escapeHtml(s.type || "link");
      return `<a href="${url}" target="_blank" style="color:${settings.brandColor};font-family:${settings.fontFamily};font-size:13px;text-decoration:none;margin:0 6px">${label}</a>`;
    })
    .join("");
  return `<div style="text-align:${a}">${links}</div>`;
}

function renderSocialBlock(block: EmailBlock, settings: EmailLayoutSettings, signature: EmailSignature): string {
  const propLinks = Array.isArray(block.props.links) ? (block.props.links as EmailSocialLink[]) : null;
  const links = propLinks ?? signature.socials ?? [];
  const html = renderSocialLinks(links, settings, align(block.props, "center"));
  return html ? row(html, "8px 24px") : "";
}

function renderSignatureBlock(settings: EmailLayoutSettings, sig: EmailSignature): string {
  const parts: string[] = [];
  const ff = settings.fontFamily;

  if (sig.logoUrl && sig.logoUrl.trim()) {
    parts.push(
      `<img src="${escapeHtml(sig.logoUrl)}" alt="${escapeHtml(sig.companyName ?? "")}" width="140" style="display:block;border:0;outline:none;max-width:100%;height:auto;margin-bottom:8px" />`
    );
  }
  if (sig.companyName && sig.companyName.trim()) {
    parts.push(
      `<p style="margin:0;font-family:${ff};font-size:14px;font-weight:700;color:#1a1a1a">${escapeHtml(sig.companyName)}</p>`
    );
  }
  const contactLine = [sig.phone, sig.website]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => escapeHtml(v))
    .join(" · ");
  if (sig.address && sig.address.trim()) {
    parts.push(
      `<p style="margin:2px 0 0;font-family:${ff};font-size:13px;color:#666666">${escapeHtml(sig.address).replace(/\r?\n/g, "<br />")}</p>`
    );
  }
  if (contactLine) {
    parts.push(`<p style="margin:2px 0 0;font-family:${ff};font-size:13px;color:#666666">${contactLine}</p>`);
  }
  const socialsHtml = renderSocialLinks(sig.socials ?? [], settings, "left");
  if (socialsHtml) {
    parts.push(`<div style="margin-top:6px">${socialsHtml}</div>`);
  }

  const disclaimer = sig.legalDisclaimer && sig.legalDisclaimer.trim() ? sig.legalDisclaimer : DEFAULT_LEGAL_DISCLAIMER;
  const body =
    `<div style="border-top:1px solid #eeeeee;padding-top:16px">${parts.join("")}</div>` +
    `<p style="margin:16px 0 0;font-family:${ff};font-size:11px;line-height:1.5;color:#999999">${escapeHtml(disclaimer)}</p>`;

  return row(body, "16px 24px 24px");
}

// ---------------------------------------------------------------------------
// Normalización + render principal
// ---------------------------------------------------------------------------

/** Completa una config parcial (p.ej. un draft `{}`) con valores por defecto. */
export function normalizeLayoutConfig(partial: Partial<EmailLayoutConfig> | null | undefined): EmailLayoutConfig {
  return {
    blocks: Array.isArray(partial?.blocks) ? (partial?.blocks as EmailBlock[]) : [],
    settings: { ...DEFAULT_EMAIL_SETTINGS, ...(partial?.settings ?? {}) },
    signature: { ...(partial?.signature ?? {}) }
  };
}

function renderBlock(
  block: EmailBlock,
  config: EmailLayoutConfig,
  ctx: RenderEmailContext
): string {
  const { settings, signature } = config;
  switch (block.type) {
    case "logo":
      return renderLogo(block, ctx.variables);
    case "heading":
      return renderHeading(block, settings, ctx.variables);
    case "text":
      return renderText(block, settings, ctx.variables);
    case "body":
      return renderBody(settings, ctx.body);
    case "button":
      return renderButton(block, settings, ctx.variables);
    case "divider":
      return renderDivider(block);
    case "spacer":
      return renderSpacer(block);
    case "image":
      return renderImage(block, ctx.variables);
    case "social":
      return renderSocialBlock(block, settings, signature);
    case "signature":
      return renderSignatureBlock(settings, signature);
    default:
      return "";
  }
}

/**
 * Renderiza la config del shell + el cuerpo de la regla a HTML email-safe.
 * Si la config no tiene bloque `body`, el cuerpo se inyecta al final para no
 * perder nunca el mensaje (defensa ante layouts mal formados).
 */
export function renderEmailLayout(
  rawConfig: Partial<EmailLayoutConfig> | null | undefined,
  ctx: RenderEmailContext
): string {
  const config = normalizeLayoutConfig(rawConfig);
  const { settings } = config;

  const hasBodyBlock = config.blocks.some((b) => b.type === "body");
  let rows = config.blocks.map((b) => renderBlock(b, config, ctx)).join("");
  if (!hasBodyBlock) {
    rows += renderBody(settings, ctx.body);
  }

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "https://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="https://www.w3.org/1999/xhtml" lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title></title>
</head>
<body style="margin:0;padding:0;background:${settings.backgroundColor};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${settings.backgroundColor}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="${settings.contentWidth}" cellpadding="0" cellspacing="0" border="0" style="width:${settings.contentWidth}px;max-width:100%;background:#ffffff;border-radius:8px;overflow:hidden">
${rows}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Layout por defecto para tenants sin shell publicado. Replica el look del
 * antiguo `buildDefaultEmailBody` de service-notifications: header de marca,
 * saludo, cuerpo de la regla, botón de pago y firma con disclaimer legal.
 */
export const DEFAULT_EMAIL_LAYOUT: EmailLayoutConfig = {
  settings: DEFAULT_EMAIL_SETTINGS,
  signature: {},
  blocks: [
    {
      id: "default-heading",
      type: "heading",
      props: { text: "{{empresa}}", level: 2, color: "#ffffff", backgroundColor: DEFAULT_BRAND_COLOR, align: "left" }
    },
    {
      id: "default-body",
      type: "body",
      props: {}
    },
    {
      id: "default-button",
      type: "button",
      props: { text: "Pagar ahora", href: "{{link_pago}}", align: "center" }
    },
    {
      id: "default-divider",
      type: "divider",
      props: {}
    },
    {
      id: "default-signature",
      type: "signature",
      props: {}
    }
  ]
};
