function isEnabled(value: string | undefined): boolean {
  if (value === undefined) return false;
  return ["1", "true", "on", "yes"].includes(value.trim().toLowerCase());
}

/**
 * Flags de producto. Por ahora la creación de nuevas reglas de automatización
 * está oculta; se habilita con NEXT_PUBLIC_ENABLE_WORKFLOW_RULE_CREATION=true.
 */
export const featureFlags = {
  workflowRuleCreation: isEnabled(
    process.env.NEXT_PUBLIC_ENABLE_WORKFLOW_RULE_CREATION
  )
};
