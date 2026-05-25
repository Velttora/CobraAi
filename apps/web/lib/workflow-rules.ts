import type { WorkflowRule } from "./types";

export type PortfolioAutomationStatus = "none" | "package" | "custom" | undefined;

/** Oculta reglas inactivas de paquetes reemplazados; en custom sí se muestran. */
export function partitionPortfolioRules(
  rules: WorkflowRule[],
  automationStatus?: PortfolioAutomationStatus
): { activeRules: WorkflowRule[]; inactiveRules: WorkflowRule[] } {
  const activeRules = rules.filter((rule) => rule.isActive);
  const inactiveRules =
    automationStatus === "custom"
      ? rules.filter((rule) => !rule.isActive)
      : [];

  return { activeRules, inactiveRules };
}
