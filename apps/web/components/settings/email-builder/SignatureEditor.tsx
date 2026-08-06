"use client";

import type { Route } from "next";
import Link from "next/link";
import { mergeBrandIntoSignature } from "@cobrai/utils";
import type { EmailSignature, EmailSocialLink } from "@cobrai/utils/email-layout";
import { Plus, Trash2 } from "lucide-react";
import { useTenant } from "../../../hooks/use-tenant";

// UI-SPEC A-05: companyName/logoUrl/address/phone/website/legalDisclaimer used
// to be a second, independently-editable copy of the tenant's company
// identity ("Integraciones > Marca" being the first). Two editable copies of
// the same data can silently diverge and show a different company name in
// email than in WhatsApp — exactly the failure this phase exists to prevent.
// These six fields are now a read-only mirror of the brand identity, merged
// the same way the real send does (`mergeBrandIntoSignature`, 08-15).
// `socials` is never touched by that merge and stays owned here.
export function SignatureEditor({
  signature,
  onChange
}: {
  signature: EmailSignature;
  onChange: (next: EmailSignature) => void;
}): React.ReactElement {
  const tenantQuery = useTenant();
  const brand = tenantQuery.data?.data?.brandIdentity;
  const merged = mergeBrandIntoSignature(signature, brand);

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

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/50">
        <dl className="space-y-2">
          <div>
            <dt className="text-xs font-medium text-slate-500">Nombre de la empresa</dt>
            <dd className="text-sm text-slate-900 dark:text-slate-100">
              {merged.companyName || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">URL del logo</dt>
            <dd className="break-all text-sm text-slate-900 dark:text-slate-100">
              {merged.logoUrl || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Dirección</dt>
            <dd className="whitespace-pre-line text-sm text-slate-900 dark:text-slate-100">
              {merged.address || "—"}
            </dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs font-medium text-slate-500">Teléfono</dt>
              <dd className="text-sm text-slate-900 dark:text-slate-100">
                {merged.phone || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Sitio web</dt>
              <dd className="break-all text-sm text-slate-900 dark:text-slate-100">
                {merged.website || "—"}
              </dd>
            </div>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Aviso legal</dt>
            <dd className="whitespace-pre-line text-sm text-slate-900 dark:text-slate-100">
              {merged.legalDisclaimer || "—"}
            </dd>
          </div>
        </dl>
        <Link
          className="mt-2 inline-block text-xs text-[#D85A30] hover:underline"
          href={"/settings/integrations/brand" as Route}
        >
          Estos datos se editan en Integraciones → Marca
        </Link>
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
    </div>
  );
}
