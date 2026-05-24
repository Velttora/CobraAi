export const PACKAGE_SOURCE_KEY = "__source_package";

export type WorkflowPackageRuleTemplate = {
  name: string;
  trigger: string;
  condition: Record<string, unknown>;
  action: string;
  channel?: string;
  delay_hours?: number;
  priority?: number;
};

export type WorkflowPackageDefinition = {
  id: string;
  name: string;
  description: string;
  profile: string;
  rules: WorkflowPackageRuleTemplate[];
};

export type WorkflowPackageSummary = {
  id: string;
  name: string;
  description: string;
  profile: string;
  rules_count: number;
  channels: string[];
  has_voice_stub: boolean;
};

export type ApplyPackageResult = {
  package_id: string;
  portfolio_id?: string;
  rules_created: number;
  rules_replaced: number;
};
