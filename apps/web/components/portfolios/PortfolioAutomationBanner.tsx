import type { Portfolio } from "../../lib/types";
import { StrategyPill } from "./StrategyPill";

export function PortfolioAutomationBanner({
  automationStatus,
  automationStartsAt
}: {
  automationStatus?: Portfolio["automationStatus"];
  automationStartsAt?: string | null;
}): React.ReactElement | null {
  if (!automationStatus || automationStatus === "none") {
    return (
      <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
        Sin estrategia de automatización — configura un paquete o reglas
        personalizadas para activar contactos automáticos.
      </p>
    );
  }

  if (automationStartsAt) {
    const starts = new Date(automationStartsAt);
    if (!Number.isNaN(starts.getTime()) && starts.getTime() > Date.now()) {
      return (
        <p className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200">
          Periodo de configuración: los contactos automáticos inician el{" "}
          {starts.toLocaleString("es-CO", {
            dateStyle: "medium",
            timeStyle: "short"
          })}
          . Puedes editar reglas y canales hasta entonces.
        </p>
      );
    }
  }

  return null;
}

export { StrategyPill };
