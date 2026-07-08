"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiItemResponse, ContactRetryPolicy, Tenant } from "../lib/types";
import { fetchApi, patchApi, useApiClient } from "./use-api-client";

export function useTenant() {
  const client = useApiClient();

  return useQuery({
    queryKey: ["tenant"],
    queryFn: () =>
      fetchApi<ApiItemResponse<Tenant>>(client, "/api/v1/tenant")
  });
}

export function useUpdateTenant() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { name: string }) =>
      patchApi<ApiItemResponse<Tenant>>(client, "/api/v1/tenant", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant"] });
    }
  });
}

export function useUpdateContactRetryPolicy() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Partial<ContactRetryPolicy>) =>
      patchApi<ApiItemResponse<Tenant>>(
        client,
        "/api/v1/tenant/contact-retry-policy",
        body
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant"] });
    }
  });
}
