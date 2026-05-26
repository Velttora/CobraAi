"use client";

import { useQuery } from "@tanstack/react-query";
import type { ApiItemResponse, ApiListResponse, Debt } from "../lib/types";
import { fetchApi, useApiClient } from "./use-api-client";

export type DebtsQuery = {
  page?: number;
  limit?: number;
  sort?: string;
  portfolioId?: string;
  status?: string;
  aiSegment?: string;
  includeFuture?: boolean;
  pipeline?: boolean;
  collectionQuarter?: string;
};

export function useDebts(query: DebtsQuery = {}) {
  const client = useApiClient();
  const params: Record<string, string | number | undefined> = {
    page: query.page ?? 1,
    limit: query.limit ?? 25,
    sort: query.sort ?? "priority_score:desc"
  };
  if (query.portfolioId) params["filter[portfolio_id]"] = query.portfolioId;
  if (query.status) params["filter[status]"] = query.status;
  if (query.aiSegment) params["filter[ai_segment]"] = query.aiSegment;
  if (query.collectionQuarter) {
    params["filter[collection_quarter]"] = query.collectionQuarter;
  }
  if (query.includeFuture) params.include_future = "true";
  if (query.pipeline) params.pipeline = "future";

  return useQuery({
    queryKey: ["debts", params],
    queryFn: () =>
      fetchApi<ApiListResponse<Debt>>(client, "/api/v1/debts", params)
  });
}

export function useDebt(id: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: ["debt", id],
    queryFn: () =>
      fetchApi<ApiItemResponse<Debt>>(client, `/api/v1/debts/${id}`),
    enabled: Boolean(id)
  });
}

export function useDebtTimeline(id: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: ["debt-timeline", id],
    queryFn: () =>
      fetchApi<ApiItemResponse<unknown[]>>(
        client,
        `/api/v1/debts/${id}/timeline`
      ),
    enabled: Boolean(id)
  });
}
