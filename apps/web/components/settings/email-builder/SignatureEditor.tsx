"use client";

import type { EmailSignature, EmailSocialLink } from "@cobrai/utils/email-layout";
import { Plus, Trash2 } from "lucide-react";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";

export function SignatureEditor({
  signature,
  onChange
}: {
  signature: EmailSignature;
  onChange: (next: EmailSignature) => void;
}): React.ReactElement {
  const set = (key: keyof EmailSignature, value: unknown) =>
    onChange({ ...signature, [key]: value === "" ? undefined : value });

  const socials = signature.socials ?? [];
  const setSocials = (next: EmailSocialLink[]) => onChange({ ...signature, socials: next });
  const updateSocial = (i: number, patch: Partial<EmailSocialLink>) =>
    setSocials(socials.map((sLink, idx) => (idx === i ? { ...sLink, ...patch } : sLink)));

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Firma de la organización
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Se inserta con el bloque <strong>Firma</strong>. Editarla aquí actualiza
        todos los correos.
      </p>

      <label className="block text-sm">
        Nombre de la empresa
        <input className={inputClass} onChange={(e) => set("companyName", e.target.value)} value={signature.companyName ?? ""} />
      </label>
      <label className="block text-sm">
        URL del logo
        <input className={inputClass} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://..." value={signature.logoUrl ?? ""} />
      </label>
      <label className="block text-sm">
        Dirección
        <textarea className={`${inputClass} min-h-16`} onChange={(e) => set("address", e.target.value)} value={signature.address ?? ""} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          Teléfono
          <input className={inputClass} onChange={(e) => set("phone", e.target.value)} value={signature.phone ?? ""} />
        </label>
        <label className="block text-sm">
          Sitio web
          <input className={inputClass} onChange={(e) => set("website", e.target.value)} value={signature.website ?? ""} />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Redes sociales</span>
          <button
            className="inline-flex items-center gap-1 text-xs text-[#D85A30] hover:underline"
            onClick={() => setSocials([...socials, { type: "", url: "" }])}
            type="button"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {socials.map((sLink, i) => (
            <div className="flex items-center gap-2" key={i}>
              <input
                className="w-1/3 rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                onChange={(e) => updateSocial(i, { type: e.target.value })}
                placeholder="LinkedIn"
                value={sLink.type}
              />
              <input
                className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                onChange={(e) => updateSocial(i, { url: e.target.value })}
                placeholder="https://..."
                value={sLink.url}
              />
              <button
                aria-label="Eliminar red"
                className="text-slate-400 hover:text-red-500"
                onClick={() => setSocials(socials.filter((_, idx) => idx !== i))}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <label className="block text-sm">
        Aviso legal
        <textarea
          className={`${inputClass} min-h-20`}
          onChange={(e) => set("legalDisclaimer", e.target.value)}
          placeholder="Por defecto: aviso de Ley 1266 de 2008 (Habeas Data)."
          value={signature.legalDisclaimer ?? ""}
        />
      </label>
    </div>
  );
}
