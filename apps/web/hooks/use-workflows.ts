"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ApiItemResponse } from "../lib/types";
import { fetchApi, patchApi, useApiClient } from "./use-api-client";

export type WorkflowRule = {
  id: string;
  name: string;
  trigger: string;
  condition: Record<string, unknown>;
  action: string;
  channel?: string | null;
  delayHours: number;
  priority: number;
  isActive: boolean;
};

export type WorkflowQueue = {
  date: string;
  total: number;
  items: {
    channel: string;
    count: number;
    debts: unknown[];
  }[];
};

export type WorkflowStats = {
  contacts_today: number;
  active_promises: number;
  escalations_today: number;
  executions_today: number;
};

export function useWorkflowRules() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["workflow-rules"],
    queryFn: () =>
      fetchApi<ApiItemResponse<WorkflowRule[]>>(
        client,
        "/api/v1/workflows/rules"
      )
  });
}

export function useWorkflowQueue() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["workflow-queue"],
    queryFn: () =>
      fetchApi<ApiItemResponse<WorkflowQueue>>(client, "/api/v1/workflows/queue")
  });
}

export function useWorkflowStats() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["workflow-stats"],
    queryFn: () =>
      fetchApi<ApiItemResponse<WorkflowStats>>(client, "/api/v1/workflows/stats")
  });
}

export function useToggleWorkflowRule() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      patchApi(client, `/api/v1/workflows/rules/${id}`, { is_active: isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflow-rules"] });
      toast.success("Regla actualizada");
    },
    onError: () => toast.error("No se pudo actualizar la regla")
  });
}
