"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useCreatePortfolio } from "../../hooks/use-portfolios";
import { useWorkflowPackages } from "../../hooks/use-workflows";

type Step = 1 | 2;

export function CreatePortfolioModal(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [strategy, setStrategy] = useState<"none" | "package" | "custom">("none");
  const [packageSlug, setPackageSlug] = useState("");
  const createPortfolio = useCreatePortfolio();
  const packagesQuery = useWorkflowPackages();
  const packages = packagesQuery.data?.data ?? [];

  function reset(): void {
    setStep(1);
    setName("");
    setDescription("");
    setStrategy("none");
    setPackageSlug("");
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (step === 1) {
      setStep(2);
      return;
    }

    try {
      await createPortfolio.mutateAsync({
        name,
        description: description || undefined,
        strategy,
        package_slug: strategy === "package" ? packageSlug : undefined
      });
      toast.success("Portafolio creado");
      setOpen(false);
      reset();
    } catch {
      toast.error("No se pudo crear el portafolio");
    }
  }

  return (
    <>
      <button
        className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29]"
        onClick={() => setOpen(true)}
        type="button"
      >
        Nuevo portafolio
      </button>

      {open
        ? motionCreatePortfolioModalOverlay({
            description,
            name,
            onBack: () => setStep(1),
            onClose: () => {
              setOpen(false);
              reset();
            },
            onDescriptionChange: setDescription,
            onNameChange: setName,
            onPackageSlugChange: setPackageSlug,
            onStrategyChange: setStrategy,
            onSubmit: handleSubmit,
            packageSlug,
            packages,
            step,
            strategy,
            submitting: createPortfolio.isPending
          })
        : null}
    </>
  );
}

function motionCreatePortfolioModalOverlay(props: {
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  step: Step;
  name: string;
  description: string;
  strategy: "none" | "package" | "custom";
  packageSlug: string;
  packages: { id: string; name: string; description: string; rules_count: number }[];
  submitting: boolean;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onStrategyChange: (v: "none" | "package" | "custom") => void;
  onPackageSlugChange: (v: string) => void;
  onBack: () => void;
}): React.ReactElement {
  const {
    onClose,
    onSubmit,
    step,
    name,
    description,
    strategy,
    packageSlug,
    packages,
    submitting,
    onNameChange,
    onDescriptionChange,
    onStrategyChange,
    onPackageSlugChange,
    onBack
  } = props;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onSubmit={onSubmit}
      >
        <h2 className="text-lg font-semibold">
          {step === 1 ? "Nuevo portafolio" : "Estrategia de automatización"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">Paso {step} de 2</p>

        {step === 1 ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              Nombre
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                onChange={(e) => onNameChange(e.target.value)}
                required
                value={name}
              />
            </label>
            <label className="block text-sm">
              Descripción
              <textarea
                className="mt-1 w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                onChange={(e) => onDescriptionChange(e.target.value)}
                rows={3}
                value={description}
              />
            </label>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Estrategia inicial</legend>
              {(
                [
                  ["none", "Sin automatización", "Configura reglas más tarde"],
                  ["package", "Paquete pre-configurado", "Reglas listas para aplicar"],
                  ["custom", "Personalizada", "Empieza vacío y agrega reglas manualmente"]
                ] as const
              ).map(([value, title, hint]) => (
                <label
                  className="flex cursor-pointer gap-3 rounded-md border px-3 py-2 dark:border-slate-700"
                  key={value}
                >
                  <input
                    checked={strategy === value}
                    name="strategy"
                    onChange={() => onStrategyChange(value)}
                    type="radio"
                    value={value}
                  />
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="text-xs text-slate-500">{hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {strategy === "package" ? (
              <label className="block text-sm">
                Paquete
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
                  onChange={(e) => onPackageSlugChange(e.target.value)}
                  required
                  value={packageSlug}
                >
                  <option value="">Selecciona un paquete</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} ({pkg.rules_count} reglas)
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        )}

        {motionCreatePortfolioModalActions({
          name,
          onBack,
          onClose,
          step,
          submitting
        })}
      </form>
    </div>
  );
}

function motionCreatePortfolioModalActions({
  onClose,
  onBack,
  step,
  submitting,
  name
}: {
  onClose: () => void;
  onBack: () => void;
  step: Step;
  submitting: boolean;
  name: string;
}): React.ReactElement {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button className="rounded-md px-4 py-2 text-sm" onClick={onClose} type="button">
        Cancelar
      </button>
      {step === 2 ? (
        <button className="rounded-md px-4 py-2 text-sm" onClick={onBack} type="button">
          Atrás
        </button>
      ) : null}
      <button
        className="rounded-md bg-[#D85A30] px-4 py-2 text-sm text-white disabled:opacity-50"
        disabled={submitting || (step === 1 && name.trim().length < 2)}
        type="submit"
      >
        {step === 1 ? "Continuar" : submitting ? "Creando…" : "Crear portafolio"}
      </button>
    </div>
  );
}
