import type { Route } from "next";
import Link from "next/link";

export default function SettingsPage(): React.ReactElement {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Configuración
      </h1>
      <p className="text-slate-600 dark:text-slate-400">
        Preferencias de la organización, equipo y automatización.
      </p>
      <Link
        className="inline-flex rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29]"
        href={"/settings/automation" as Route}
      >
        Automatización y reglas
      </Link>
      <Link
        className="inline-flex rounded-md border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
        href={"/settings/templates" as Route}
      >
        Templates de contacto
      </Link>
    </div>
  );
}
