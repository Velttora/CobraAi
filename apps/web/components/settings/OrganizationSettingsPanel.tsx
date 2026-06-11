"use client";

import { useAuth } from "@clerk/nextjs";
import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTenant, useUpdateTenant } from "../../hooks/use-tenant";

export function OrganizationSettingsPanel(): React.ReactElement {
  const { orgRole } = useAuth();
  const isAdmin = (orgRole?.replace(/^org:/, "") ?? "viewer") === "admin";

  const tenantQuery = useTenant();
  const updateTenant = useUpdateTenant();
  const tenant = tenantQuery.data?.data;

  const [name, setName] = useState("");

  useEffect(() => {
    if (tenant?.name) {
      setName(tenant.name);
    }
  }, [tenant?.name]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("El nombre no puede estar vacío");
      return;
    }

    try {
      await updateTenant.mutateAsync({ name: trimmed });
      toast.success("Organización actualizada");
    } catch {
      toast.error("No se pudo guardar el nombre de la organización");
    }
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Organización
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Nombre de tu empresa u organización. Se usa en la plataforma y en
            las comunicaciones con deudores.
          </p>

          {tenantQuery.isLoading ? (
            <p className="mt-4 text-sm text-slate-500">Cargando…</p>
          ) : tenantQuery.isError ? (
            <p className="mt-4 text-sm text-[#A32D2D]">
              No se pudo cargar la organización.
            </p>
          ) : (
            <form
              className="mt-4 max-w-md space-y-3"
              onSubmit={(e) => void handleSubmit(e)}
            >
              <label className="block text-sm font-medium">
                Nombre
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-900"
                  disabled={!isAdmin || updateTenant.isPending}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mi empresa"
                  type="text"
                  value={name}
                />
              </label>

              {!isAdmin ? (
                <p className="text-xs text-slate-500">
                  Solo los administradores pueden editar el nombre.
                </p>
              ) : (
                <button
                  className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c24f29] disabled:opacity-60"
                  disabled={
                    updateTenant.isPending ||
                    name.trim() === "" ||
                    name.trim() === tenant?.name
                  }
                  type="submit"
                >
                  {updateTenant.isPending ? "Guardando…" : "Guardar"}
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </article>
  );
}
