/** Segmentos de riesgo alineados con scoring y workflows. */
export type RiskSegment = "critical" | "high" | "medium" | "low" | "minimal";

export interface ApiMeta {
  request_id: string;
  timestamp: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationMeta;
}
