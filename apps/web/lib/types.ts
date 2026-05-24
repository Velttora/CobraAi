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

export interface Portfolio {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  totalDebts: number;
  totalAmount: string | number;
  currency: string;
  importedAt?: string | null;
  createdAt: string;
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

export interface Debt {
  id: string;
  portfolioId: string;
  debtorId: string;
  externalRef?: string | null;
  amountOriginal: string | number;
  amountOutstanding: string | number;
  currency: string;
  dueDate: string;
  agingBucket: string;
  status: string;
  aiScore?: number | null;
  aiSegment?: string | null;
  riskLevel?: string | null;
  bestChannel?: string | null;
  createdAt: string;
  debtor?: Debtor;
  portfolio?: Portfolio;
  timeline_preview?: TimelineEvent[];
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
