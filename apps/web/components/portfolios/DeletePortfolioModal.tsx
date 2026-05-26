"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useDeletePortfolio } from "../../hooks/use-portfolios";
import type { Portfolio } from "../../lib/types";

export function DeletePortfolioModal({
  portfolio
}: {
  portfolio: Portfolio;
}): React.ReactElement {
  const router = useRouter();
  const deletePortfolio = useDeletePortfolio();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmName, setConfirmName] = useState("");

  const nameMatches = confirmName.trim() === portfolio.name;

  function reset(): void {
    setStep(1);
    setConfirmName("");
  }

  function close(): void {
    setOpen(false);
    reset();
  }

  async function handleDelete(): Promise<void> {
    if (!nameMatches) return;
    try {
      await deletePortfolio.mutateAsync(portfolio.id);
      toast.success("Portafolio eliminado");
      close();
      router.push("/portfolios" as Route);
    } catch {
      toast.error("No se pudo eliminar el portafolio");
    }
  }

  return (
    <>
      <button
        className="inline-flex items-center gap-1.5 rounded-md border border-[#A32D2D]/30 px-3 py-2 text-sm font-medium text-[#A32D2D] hover:bg-[#A32D2D]/5 dark:border-[#A32D2D]/50"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
        Eliminar
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            {step === 1 ? (
              <>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  ¿Eliminar portafolio?
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Vas a eliminar <strong>{portfolio.name}</strong> y todo lo
                  asociado: deudas, deudores sin otras carteras, contactos,
                  pagos, conversaciones, reglas de automatización e historial del
                  portafolio. Esta acción no se puede deshacer.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    onClick={close}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="rounded-md bg-[#A32D2D] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f2626]"
                    onClick={() => setStep(2)}
                    type="button"
                  >
                    Continuar
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Confirmar eliminación
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Escribe el nombre exacto del portafolio para confirmar:
                </p>
                <p className="mt-2 rounded-md bg-slate-100 px-3 py-2 font-mono text-sm dark:bg-slate-800">
                  {portfolio.name}
                </p>
                <label className="mt-4 block text-sm">
                  Nombre del portafolio
                  <input
                    autoComplete="off"
                    autoFocus
                    className="mt-1 w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                    onChange={(e) => setConfirmName(e.target.value)}
                    placeholder={portfolio.name}
                    value={confirmName}
                  />
                </label>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    onClick={() => setStep(1)}
                    type="button"
                  >
                    Atrás
                  </button>
                  <button
                    className="rounded-md bg-[#A32D2D] px-4 py-2 text-sm font-medium text-white hover:bg-[#8f2626] disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!nameMatches || deletePortfolio.isPending}
                    onClick={() => void handleDelete()}
                    type="button"
                  >
                    {deletePortfolio.isPending
                      ? "Eliminando…"
                      : "Eliminar portafolio"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
