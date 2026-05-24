"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import type { ApiListResponse } from "../lib/types";
import { fetchApi, useApiClient } from "./use-api-client";

export type AuditLogRow = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  userId?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
  changes?: Record<string, unknown>;
};

export function useAuditLogs(params: {
  user_id?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  enabled?: boolean;
}) {
  const client = useApiClient();
  const { orgRole } = useAuth();
  const role = orgRole?.replace(/^org:/, "") ?? "viewer";

  return useQuery({
    queryKey: ["audit-logs", params],
    enabled: (params.enabled ?? true) && role === "admin",
    queryFn: () =>
      fetchApi<ApiListResponse<AuditLogRow>>(client, "/api/v1/audit-logs", {
        user_id: params.user_id,
        action: params.action,
        from: params.from,
        to: params.to,
        page: params.page ?? 1,
        limit: 50
      })
  });
}

export function useIsAdmin(): boolean {
  const { orgRole } = useAuth();
  return (orgRole?.replace(/^org:/, "") ?? "viewer") === "admin";
}
