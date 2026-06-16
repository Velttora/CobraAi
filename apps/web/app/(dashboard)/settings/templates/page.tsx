import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmailBuilder } from "../../../../components/settings/email-builder/EmailBuilder";

export default function EmailTemplatePage(): React.ReactElement {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <Link
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#D85A30]"
          href="/settings"
        >
          <ArrowLeft className="h-4 w-4" /> Configuración
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Plantilla de correo
        </h1>
        <p className="text-sm text-slate-500">
          Diseña con bloques la estructura de los correos a deudores. El cuerpo de
          cada correo lo define el mensaje de la regla; aquí defines el marco
          (logo, encabezado, botón, firma) y la firma de tu organización.
        </p>
      </header>

      <EmailBuilder />
    </section>
  );
}
