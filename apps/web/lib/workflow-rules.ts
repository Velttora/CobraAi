import type { WorkflowRule } from "./types";

export type PortfolioAutomationStatus = "none" | "package" | "custom" | undefined;

export function partitionPortfolioRules(
  rules: WorkflowRule[],
  _automationStatus?: PortfolioAutomationStatus
): { activeRules: WorkflowRule[]; inactiveRules: WorkflowRule[] } {
  return {
    activeRules: rules.filter((rule) => rule.isActive),
    inactiveRules: rules.filter((rule) => !rule.isActive)
  };
}
