import type { BrandIdentity } from "@cobrai/utils";

export interface ApiMeta {
  request_id: string;
  timestamp: string;
}

export interface ApiListResponse<T> {
  success: boolean;
  data: {
    items: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      total_pages: number;
    };
  };
  meta: ApiMeta;
}

export interface ApiItemResponse<T> {
  success: boolean;
  data: T;
  meta: ApiMeta;
}

export interface ContactRetryPolicy {
  windowHours: number;
  maxAttempts: number;
  escalation: "switch_channel" | "same_channel";
  escalateTo: "legal_risk" | "human";
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  contactRetryPolicy: ContactRetryPolicy;
  /** Company identity shown to a debtor across every channel (08-15). */
  brandIdentity?: BrandIdentity;
}

export interface Portfolio {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  automationStatus?: "none" | "package" | "custom";
  activePackageSlug?: string | null;
  /** ISO date; contacts wait until this time after enabling automation. */
  automationStartsAt?: string | null;
  rulesCount?: number;
  totalDebts: number;
  totalAmount: string | number;
  currency: string;
  importedAt?: string | null;
  createdAt: string;
  workflowRules?: WorkflowRule[];
  packageApplications?: PortfolioPackageApplication[];
}

export interface PortfolioPackageApplication {
  id: string;
  packageSlug?: string | null;
  action: string;
  createdAt: string;
}

export interface WorkflowRule {
  id: string;
  portfolioId?: string | null;
  name: string;
  trigger: string;
  condition: Record<string, unknown>;
  action: string;
  channel?: string | null;
  delayHours: number;
  priority: number;
  isActive: boolean;
  templateId?: string | null;
}

export interface Debtor {
  id: string;
  name: string;
  email?: string | null;
  phones: string[];
  whatsappOptIn: boolean;
  taxId?: string | null;
  type: string;
}

export interface PortfolioQuarterStat {
  quarter: string;
  label: string;
  amount: number;
  debts_count: number;
  status: "active" | "upcoming" | "future";
  recovered: number;
  recovery_rate: number;
  aging_summary: Record<string, number> | null;
}

export interface PortfolioStats {
  total_active_amount: number;
  total_active_debts: number;
  recovery_rate: number;
  dso_average: number;
  recovered_amount: number;
  total_portfolio_amount: number;
  total_portfolio_debts: number;
  quarters: PortfolioQuarterStat[];
}

export interface Debt {
  id: string;
  portfolioId: string;
  debtorId: string;
  externalRef?: string | null;
  amountOriginal: string | number;
  amountOutstanding: string | number;
  currency: string;
  dueDate: string;
  scheduledCollectionDate?: string | null;
  paymentTermsDays?: number | null;
  collectionQuarter?: string | null;
  invoiceDate?: string | null;
  agingBucket: string;
  status: string;
  aiScore?: number | null;
  priorityScore?: number | null;
  aiSegment?: string | null;
  riskLevel?: string | null;
  bestChannel?: string | null;
  createdAt: string;
  debtor?: Debtor;
  portfolio?: Portfolio;
  timeline_preview?: TimelineEvent[];
  /** Estado de respuesta del intento de contacto más reciente (Mensaje enviado / Contacto efectivo / Sin contacto). */
  lastContactResponseStatus?: string | null;
  lastContactAttempt?: number | null;
}

export interface TimelineEvent {
  type: string;
  at: string;
  data: Record<string, unknown>;
}

export interface ImportJob {
  job_id: string;
  status: string;
  estimated_rows: number;
  processed_rows?: number;
  success_rows?: number;
  error_rows?: number;
  errors?: string[];
}

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

// ── Settings > Integraciones (Phase 8) ──────────────────────────────────────
// Mirrors packages/integrations' IntegrationView (08-03) and the API built in
// 08-14. `apps/web` does not depend on the backend package — the existing
// convention in this file is locally declared response types.

export type IntegrationStatus =
  | "not_configured"
  | "verifying"
  | "verified"
  | "failed"
  | "pending_dns"
  | "pending_meta";

export type IntegrationChannel = "whatsapp" | "voice" | "email" | "payments";

export interface IntegrationSecretMeta {
  field: string;
  lastFour: string | null;
  savedAt: string | null;
}

export interface IntegrationView {
  provider: string;
  channel: IntegrationChannel;
  mode: "managed" | "byo";
  status: IntegrationStatus;
  verifiedAt: string | null;
  failureMessage: string | null;
  publicConfig: Record<string, string>;
  /** NEVER a plaintext value — `lastFour` is the maximum disclosure (D-26). */
  secrets: IntegrationSecretMeta[];
  webhookUrl: string | null;
  dnsRecords?: { type: "CNAME"; host: string; value: string; verified: boolean }[];
}

export interface UncontactedDebt {
  debtId: string;
  debtorId: string;
  debtorName: string;
  externalRef: string | null;
  amountOutstanding: number;
  currency: string;
  blockedChannel: string;
  blockedSince: string;
}

/**
 * Request body for `PUT /api/v1/integrations/:provider`. Deliberately a
 * distinct type from `IntegrationView` (D-26): `secrets` is a plain
 * `Record<string, string>` of NEW values the caller is sending, present only
 * on this request type. A secret field left untouched is simply absent from
 * this object, so the backend preserves whatever it already has stored — the
 * response type (`IntegrationView`) structurally cannot carry a value back,
 * so a secret can never enter the React Query cache by construction.
 */
export interface SaveIntegrationInput {
  mode: "managed" | "byo";
  publicConfig?: Record<string, string>;
  secrets?: Record<string, string>;
}
