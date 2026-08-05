"use client";

import { useAuth } from "@clerk/nextjs";
import { EMPTY_BRAND_IDENTITY, type BrandIdentity } from "@cobrai/utils";
import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTenant, useUpdateBrandIdentity } from "../../../hooks/use-tenant";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-900";

const FIELD_LABELS: Record<keyof BrandIdentity, string> = {
  commercialName: "Nombre comercial",
  logoUrl: "Logo (URL)",
  supportPhone: "Teléfono de atención",
  supportEmail: "Correo de atención",
  website: "Sitio web",
  address: "Dirección",
  legalName: "Razón social",
  taxId: "NIT",
  legalNotice: "Aviso legal"
};

function identityEquals(a: BrandIdentity, b: BrandIdentity): boolean {
  return (Object.keys(EMPTY_BRAND_IDENTITY) as (keyof BrandIdentity)[]).every(
    (key) => a[key] === b[key]
  );
}

export function BrandIdentityPanel({
  onDraftChange
}: {
  /** Lets the brand page bind the live (unsaved) draft to `BrandMessagePreview`. */
  onDraftChange?: (draft: BrandIdentity) => void;
} = {}): React.ReactElement {
  const { orgRole } = useAuth();
  const isAdmin = (orgRole?.replace(/^org:/, "") ?? "viewer") === "admin";

  const tenantQuery = useTenant();
  const updateBrandIdentity = useUpdateBrandIdentity();

  const saved = tenantQuery.data?.data?.brandIdentity ?? EMPTY_BRAND_IDENTITY;
  const [draft, setDraft] = useState<BrandIdentity | null>(null);
  const identity = draft ?? saved;

  useEffect(() => {
    setDraft(null);
  }, [
    saved.commercialName,
    saved.logoUrl,
    saved.supportPhone,
    saved.supportEmail,
    saved.website,
    saved.address,
    saved.legalName,
    saved.taxId,
    saved.legalNotice
  ]);

  useEffect(() => {
    onDraftChange?.(identity);
  }, [identity, onDraftChange]);

  const isDirty = !!draft && !identityEquals(draft, saved);

  const set = (key: keyof BrandIdentity, value: string) =>
    setDraft({ ...identity, [key]: value === "" ? null : value });

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!draft) return;

    try {
      await updateBrandIdentity.mutateAsync(draft);
      setDraft(null);
      toast.success("Identidad de marca actualizada");
    } catch {
      toast.error("No se pudo guardar la identidad de marca");
    }
  }

  const isEmpty = !identity.commercialName?.trim();

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Identidad de marca
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Los datos de tu empresa que ve el deudor en cada mensaje, correo y llamada.
          </p>

          {isEmpty && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Tus mensajes salen sin marca
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Sin nombre comercial, los deudores ven &quot;su gestor de cobranza&quot; en
                lugar del nombre de tu empresa.
              </p>
            </div>
          )}

          {tenantQuery.isLoading ? (
            <p className="mt-4 text-sm text-slate-500">Cargando…</p>
          ) : tenantQuery.isError ? (
            <p className="mt-4 text-sm text-[#A32D2D]">
              No se pudo cargar la identidad de marca.
            </p>
          ) : isAdmin ? (
            <form className="mt-4 max-w-md space-y-6" onSubmit={(e) => void handleSubmit(e)}>
              <fieldset>
                <legend className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Identidad
                </legend>
                <div className="mt-3 space-y-3">
                  <label className="block text-sm font-medium">
                    {FIELD_LABELS.commercialName}{" "}
                    <span aria-hidden="true" className="text-[#A32D2D]">
                      *
                    </span>
                    <input
                      aria-required="true"
                      className={inputClass}
                      disabled={updateBrandIdentity.isPending}
                      onChange={(e) => set("commercialName", e.target.value)}
                      value={identity.commercialName ?? ""}
                    />
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      Es el nombre que ve el deudor en cada mensaje. Si lo dejas vacío,
                      aparecerá &quot;su gestor de cobranza&quot;.
                    </span>
                  </label>
                  <label className="block text-sm font-medium">
                    {FIELD_LABELS.logoUrl}
                    <input
                      className={inputClass}
                      disabled={updateBrandIdentity.isPending}
                      onChange={(e) => set("logoUrl", e.target.value)}
                      placeholder="https://..."
                      value={identity.logoUrl ?? ""}
                    />
                  </label>
                  {identity.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt="Vista previa del logo"
                      className="h-12 w-auto rounded border border-slate-200 object-contain dark:border-slate-700"
                      src={identity.logoUrl}
                    />
                  )}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Contacto
                </legend>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block text-sm font-medium">
                    {FIELD_LABELS.supportPhone}
                    <input
                      className={inputClass}
                      disabled={updateBrandIdentity.isPending}
                      onChange={(e) => set("supportPhone", e.target.value)}
                      value={identity.supportPhone ?? ""}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    {FIELD_LABELS.supportEmail}
                    <input
                      className={inputClass}
                      disabled={updateBrandIdentity.isPending}
                      onChange={(e) => set("supportEmail", e.target.value)}
                      value={identity.supportEmail ?? ""}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    {FIELD_LABELS.website}
                    <input
                      className={inputClass}
                      disabled={updateBrandIdentity.isPending}
                      onChange={(e) => set("website", e.target.value)}
                      placeholder="https://..."
                      value={identity.website ?? ""}
                    />
                  </label>
                  <label className="block text-sm font-medium md:col-span-2">
                    {FIELD_LABELS.address}
                    <textarea
                      className={`${inputClass} min-h-16`}
                      disabled={updateBrandIdentity.isPending}
                      onChange={(e) => set("address", e.target.value)}
                      value={identity.address ?? ""}
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Firma legal
                </legend>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block text-sm font-medium">
                    {FIELD_LABELS.legalName}
                    <input
                      className={inputClass}
                      disabled={updateBrandIdentity.isPending}
                      onChange={(e) => set("legalName", e.target.value)}
                      value={identity.legalName ?? ""}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    {FIELD_LABELS.taxId}
                    <input
                      className={inputClass}
                      disabled={updateBrandIdentity.isPending}
                      onChange={(e) => set("taxId", e.target.value)}
                      value={identity.taxId ?? ""}
                    />
                  </label>
                  <label className="block text-sm font-medium md:col-span-2">
                    {FIELD_LABELS.legalNotice}
                    <textarea
                      className={`${inputClass} min-h-16`}
                      disabled={updateBrandIdentity.isPending}
                      onChange={(e) => set("legalNotice", e.target.value)}
                      value={identity.legalNotice ?? ""}
                    />
                  </label>
                </div>
              </fieldset>

              <button
                className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c24f29] disabled:opacity-60"
                disabled={updateBrandIdentity.isPending || !isDirty}
                type="submit"
              >
                {updateBrandIdentity.isPending ? "Guardando…" : "Guardar identidad"}
              </button>
            </form>
          ) : (
            <div className="mt-4 max-w-md">
              <dl className="grid grid-cols-2 gap-3">
                {(Object.keys(FIELD_LABELS) as (keyof BrandIdentity)[]).map((key) => (
                  <div className={key === "address" || key === "legalNotice" ? "col-span-2" : ""} key={key}>
                    <dt className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {FIELD_LABELS[key]}
                    </dt>
                    <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                      {identity[key] || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-slate-500">
                Solo un administrador puede cambiar esta configuración.
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
