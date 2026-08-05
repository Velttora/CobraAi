"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_EMAIL_LAYOUT,
  EMPRESA_FALLBACK,
  mergeBrandIntoSignature,
  type BrandIdentity,
  type EmailLayoutConfig
} from "@cobrai/utils";
import { cn } from "../../../lib/utils";
import { useDebounce } from "../../../hooks/use-debounce";
import type { IntegrationView } from "../../../lib/types";
import { LayoutPreview } from "../email-builder/LayoutPreview";

const PANES = ["whatsapp", "correo", "voz"] as const;
type Pane = (typeof PANES)[number];

const PANE_LABELS: Record<Pane, string> = {
  whatsapp: "WhatsApp",
  correo: "Correo",
  voz: "Voz"
};

/**
 * Renders the resolved commercial name inline, or the real `EMPRESA_FALLBACK`
 * in italic slate when the tenant left it empty — never a raw `{empresa}`
 * placeholder token (UI-SPEC "live-update and fallback rules").
 */
function EmpresaText({ commercialName }: { commercialName: string | null }): React.ReactElement {
  const trimmed = commercialName?.trim();
  if (trimmed) return <>{trimmed}</>;
  return <span className="italic text-slate-500">{EMPRESA_FALLBACK}</span>;
}

function whatsappHeaderName(integration: IntegrationView | null | undefined): string | null {
  if (!integration || integration.status !== "verified") return null;
  return (
    integration.publicConfig.businessName ??
    integration.publicConfig.senderName ??
    integration.publicConfig.phoneNumberE164 ??
    null
  );
}

function WhatsappPane({
  draft,
  whatsappIntegration
}: {
  draft: BrandIdentity;
  whatsappIntegration: IntegrationView | null | undefined;
}): React.ReactElement {
  const headerName = whatsappHeaderName(whatsappIntegration);

  return (
    <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
      <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
        {headerName ?? <span className="text-slate-500">Sin conectar</span>}
      </p>
      <div className="rounded-lg bg-[#DCF8C6] p-3 text-sm text-slate-900 dark:bg-teal-950 dark:text-teal-50">
        Hola María López, te escribimos de parte de <EmpresaText commercialName={draft.commercialName} /> por
        tu saldo pendiente de 1.250.000 COP (ref. FAC-00123). Si ya pagaste, ignora este mensaje.
      </div>
    </div>
  );
}

function CorreoPane({ draft }: { draft: BrandIdentity }): React.ReactElement {
  const config: EmailLayoutConfig = {
    ...DEFAULT_EMAIL_LAYOUT,
    signature: mergeBrandIntoSignature(DEFAULT_EMAIL_LAYOUT.signature, draft)
  };

  return (
    <div className="h-80">
      <LayoutPreview config={config} />
    </div>
  );
}

function VozPane({ draft }: { draft: BrandIdentity }): React.ReactElement {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
      <p className="text-sm text-slate-900 dark:text-slate-100">
        &quot;Buenas tardes, le llamo de <EmpresaText commercialName={draft.commercialName} /> por su
        obligación pendiente…&quot;
      </p>
      <p className="mt-2 text-xs text-slate-500">Así se presenta el agente en la llamada.</p>
    </div>
  );
}

export function BrandMessagePreview({
  draft,
  whatsappIntegration
}: {
  draft: BrandIdentity;
  whatsappIntegration?: IntegrationView | null;
}): React.ReactElement {
  const debouncedDraft = useDebounce(draft, 300);
  const [activePane, setActivePane] = useState<Pane>("whatsapp");
  const [announceKey, setAnnounceKey] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setAnnounceKey((k) => k + 1);
  }, [debouncedDraft]);

  function handleKeyDown(e: React.KeyboardEvent, idx: number): void {
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % PANES.length;
    if (e.key === "ArrowLeft") nextIdx = (idx - 1 + PANES.length) % PANES.length;
    if (nextIdx === null) return;

    e.preventDefault();
    const nextPane = PANES.at(nextIdx);
    if (!nextPane) return;
    setActivePane(nextPane);
    tabRefs.current[nextIdx]?.focus();
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Así le llega al deudor
      </h2>

      <div
        aria-label="Vista previa por canal"
        className="mt-3 inline-flex gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800"
        role="tablist"
      >
        {PANES.map((pane, idx) => (
          <button
            aria-controls={`brand-preview-panel-${pane}`}
            aria-selected={activePane === pane}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition",
              activePane === pane
                ? "bg-[#D85A30] text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
            )}
            id={`brand-preview-tab-${pane}`}
            key={pane}
            onClick={() => setActivePane(pane)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            role="tab"
            tabIndex={activePane === pane ? 0 : -1}
            type="button"
          >
            {PANE_LABELS[pane]}
          </button>
        ))}
      </div>

      <div
        aria-labelledby={`brand-preview-tab-${activePane}`}
        className="mt-3"
        id={`brand-preview-panel-${activePane}`}
        role="tabpanel"
      >
        {activePane === "whatsapp" && (
          <WhatsappPane draft={debouncedDraft} whatsappIntegration={whatsappIntegration} />
        )}
        {activePane === "correo" && <CorreoPane draft={debouncedDraft} />}
        {activePane === "voz" && <VozPane draft={debouncedDraft} />}
      </div>

      <div aria-live="polite" className="sr-only">
        <span key={announceKey}>Vista previa actualizada</span>
      </div>
    </article>
  );
}
