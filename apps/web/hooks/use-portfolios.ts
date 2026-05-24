"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  ApiItemResponse,
  ApiListResponse,
  Debtor,
  Portfolio
} from "../lib/types";
import { fetchApi, useApiClient } from "./use-api-client";

export function usePortfolios() {
  const client = useApiClient();

  return useQuery({
    queryKey: ["portfolios"],
    queryFn: () =>
      fetchApi<ApiListResponse<Portfolio>>(client, "/api/v1/portfolios", {
        limit: 50
      })
  });
}

export function usePortfolio(id: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: ["portfolio", id],
    queryFn: () =>
      fetchApi<ApiItemResponse<Portfolio>>(client, `/api/v1/portfolios/${id}`),
    enabled: Boolean(id)
  });
}

export function usePortfolioStats(id: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: ["portfolio-stats", id],
    queryFn: () =>
      fetchApi<ApiItemResponse<Record<string, unknown>>>(
        client,
        `/api/v1/portfolios/${id}/stats`
      ),
    enabled: Boolean(id)
  });
}

export function useDebtor(id: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: ["debtor", id],
    queryFn: () =>
      fetchApi<ApiItemResponse<Debtor>>(client, `/api/v1/debtors/${id}`),
    enabled: Boolean(id)
  });
}
