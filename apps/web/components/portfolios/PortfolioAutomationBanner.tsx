import type { Portfolio } from "../../lib/types";
import { StrategyPill } from "./StrategyPill";

export function PortfolioAutomationBanner({
  automationStatus
}: {
  automationStatus?: Portfolio["automationStatus"];
}): React.ReactElement | null {
  if (automationStatus && automationStatus !== "none") {
    return null;
  }

  return (
    <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
      Sin estrategia de automatización — configura un paquete o reglas personalizadas
      para activar contactos automáticos.
    </p>
  );
}

export { StrategyPill };
