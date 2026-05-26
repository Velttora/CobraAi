"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApiItemResponse,
  ApiListResponse,
  Debtor,
  Portfolio
} from "../lib/types";
import { fetchApi, patchApi, postApi, deleteApi, useApiClient } from "./use-api-client";

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
      fetchApi<ApiItemResponse<import("../lib/types").PortfolioStats>>(
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

export function useCreatePortfolio() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      name: string;
      description?: string;
      currency?: string;
      strategy?: "none" | "package" | "custom";
      package_slug?: string;
    }) => postApi<ApiItemResponse<Portfolio>>(client, "/api/v1/portfolios", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["portfolios"] });
    }
  });
}

export function useUpdatePortfolioStrategy(portfolioId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      strategy: "none" | "package" | "custom";
      package_slug?: string;
      overwrite?: boolean;
    }) =>
      patchApi<
        ApiItemResponse<
          Portfolio & {
            confirm_required?: boolean;
            existing_count?: number;
            package_id?: string;
          }
        >
      >(client, `/api/v1/portfolios/${portfolioId}/strategy`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
      void queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      void queryClient.invalidateQueries({ queryKey: ["workflow-rules"] });
    }
  });
}

export function useDeletePortfolio() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (portfolioId: string) =>
      deleteApi<ApiItemResponse<Portfolio>>(
        client,
        `/api/v1/portfolios/${portfolioId}`
      ),
    onSuccess: (_data, portfolioId) => {
      void queryClient.invalidateQueries({ queryKey: ["portfolios"] });
      void queryClient.removeQueries({ queryKey: ["portfolio", portfolioId] });
      void queryClient.removeQueries({ queryKey: ["portfolio-stats", portfolioId] });
      void queryClient.removeQueries({ queryKey: ["debts"] });
    }
  });
}
