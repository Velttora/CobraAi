"use client";

import { useAuth } from "@clerk/nextjs";
import { Repeat } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ContactRetryPolicy } from "../../lib/types";
import { useTenant, useUpdateContactRetryPolicy } from "../../hooks/use-tenant";

const ESCALATION_OPTIONS: { value: ContactRetryPolicy["escalation"]; label: string }[] = [
  { value: "switch_channel", label: "Cambiar de canal en cada reintento" },
  { value: "same_channel", label: "Reintentar por el mismo canal" }
];

const ESCALATE_TO_OPTIONS: { value: ContactRetryPolicy["escalateTo"]; label: string }[] = [
  { value: "legal_risk", label: "Marcar la deuda en riesgo legal" },
  { value: "human", label: "Escalar a un agente humano" }
];

export function ContactRetryPolicyPanel(): React.ReactElement {
  const { orgRole } = useAuth();
  const isAdmin = (orgRole?.replace(/^org:/, "") ?? "viewer") === "admin";

  const tenantQuery = useTenant();
  const updatePolicy = useUpdateContactRetryPolicy();

  const savedPolicy = tenantQuery.data?.data?.contactRetryPolicy ?? null;
  const [draft, setDraft] = useState<ContactRetryPolicy | null>(null);
  const policy = draft ?? savedPolicy;

  useEffect(() => {
    setDraft(null);
  }, [
    savedPolicy?.windowHours,
    savedPolicy?.maxAttempts,
    savedPolicy?.escalation,
    savedPolicy?.escalateTo
  ]);

  const isDirty =
    !!draft &&
    !!savedPolicy &&
    (draft.windowHours !== savedPolicy.windowHours ||
      draft.maxAttempts !== savedPolicy.maxAttempts ||
      draft.escalation !== savedPolicy.escalation ||
      draft.escalateTo !== savedPolicy.escalateTo);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!policy) return;

    try {
      await updatePolicy.mutateAsync(policy);
      setDraft(null);
      toast.success("Política de reintento actualizada");
    } catch {
      toast.error("No se pudo guardar la política de reintento");
    }
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Repeat className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Reintentos de contacto
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Si un deudor no responde, esperamos este tiempo antes de reintentar por otro
            canal. Al agotar los intentos, se escala según lo que definas abajo.
          </p>

          {tenantQuery.isLoading ? (
            <p className="mt-4 text-sm text-slate-500">Cargando…</p>
          ) : tenantQuery.isError || !policy ? (
            <p className="mt-4 text-sm text-[#A32D2D]">
              No se pudo cargar la política de reintento.
            </p>
          ) : isAdmin ? (
            <form
              className="mt-4 max-w-md space-y-4"
              onSubmit={(e) => void handleSubmit(e)}
            >
              <label className="block text-sm font-medium">
                Horas de espera antes de reintentar
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-900"
                  disabled={updatePolicy.isPending}
                  min={1}
                  max={336}
                  onChange={(e) =>
                    setDraft({ ...policy, windowHours: Number(e.target.value) })
                  }
                  type="number"
                  value={policy.windowHours}
                />
              </label>

              <label className="block text-sm font-medium">
                Máximo de intentos antes de escalar
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-900"
                  disabled={updatePolicy.isPending}
                  min={1}
                  max={10}
                  onChange={(e) =>
                    setDraft({ ...policy, maxAttempts: Number(e.target.value) })
                  }
                  type="number"
                  value={policy.maxAttempts}
                />
              </label>

              <label className="block text-sm font-medium">
                Al reintentar
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-900"
                  disabled={updatePolicy.isPending}
                  onChange={(e) =>
                    setDraft({
                      ...policy,
                      escalation: e.target.value as ContactRetryPolicy["escalation"]
                    })
                  }
                  value={policy.escalation}
                >
                  {ESCALATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium">
                Al agotar los intentos sin respuesta
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:disabled:bg-slate-900"
                  disabled={updatePolicy.isPending}
                  onChange={(e) =>
                    setDraft({
                      ...policy,
                      escalateTo: e.target.value as ContactRetryPolicy["escalateTo"]
                    })
                  }
                  value={policy.escalateTo}
                >
                  {ESCALATE_TO_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c24f29] disabled:opacity-60"
                disabled={updatePolicy.isPending || !isDirty}
                type="submit"
              >
                {updatePolicy.isPending ? "Guardando…" : "Guardar"}
              </button>
            </form>
          ) : (
            <dl className="mt-4 grid max-w-md grid-cols-2 gap-3">
              <div>
                <dt className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Espera antes de reintentar
                </dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                  {policy.windowHours}h
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Máximo de intentos
                </dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                  {policy.maxAttempts}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Al reintentar
                </dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                  {ESCALATION_OPTIONS.find((o) => o.value === policy.escalation)?.label ??
                    policy.escalation}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Al agotar los intentos
                </dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                  {ESCALATE_TO_OPTIONS.find((o) => o.value === policy.escalateTo)?.label ??
                    policy.escalateTo}
                </dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </article>
  );
}
