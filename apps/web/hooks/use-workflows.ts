"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import type { ApiItemResponse } from "../lib/types";
import { deleteApi, fetchApi, patchApi, postApi, useApiClient } from "./use-api-client";

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
  templateId?: string | null;
};

function normalizeWorkflowRule(raw: Record<string, unknown>): WorkflowRule {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    trigger: String(raw.trigger ?? ""),
    condition:
      raw.condition && typeof raw.condition === "object" && !Array.isArray(raw.condition)
        ? (raw.condition as Record<string, unknown>)
        : {},
    action: String(raw.action ?? ""),
    channel: (raw.channel as string | null | undefined) ?? null,
    delayHours: Number(raw.delayHours ?? raw.delay_hours ?? 0),
    priority: Number(raw.priority ?? 100),
    isActive: Boolean(raw.isActive ?? raw.is_active ?? true),
    templateId: (raw.templateId ?? raw.template_id ?? null) as string | null
  };
}

export type WorkflowPackageSummary = {
  id: string;
  name: string;
  description: string;
  profile: string;
  rules_count: number;
  channels: string[];
  has_voice_stub: boolean;
};

export type WorkflowPackageDetail = WorkflowPackageSummary & {
  rules: {
    name: string;
    trigger: string;
    condition: Record<string, unknown>;
    action: string;
    channel?: string;
    delay_hours?: number;
    priority?: number;
  }[];
};

export type WorkflowQueue = {
  date: string;
  total: number;
  items: {
    channel: string;
    count: number;
    debts: unknown[];
  }[];
  by_portfolio?: {
    portfolio_id: string;
    portfolio_name: string;
    total: number;
    by_channel: Record<string, number>;
  }[];
};

export type WorkflowStats = {
  contacts_today: number;
  active_promises: number;
  escalations_today: number;
  executions_today: number;
};

export class WorkflowPackageConflictError extends Error {
  packageId: string;
  existingCount: number;

  constructor(packageId: string, existingCount: number, message: string) {
    super(message);
    this.name = "WorkflowPackageConflictError";
    this.packageId = packageId;
    this.existingCount = existingCount;
  }
}

export function formatWorkflowChannel(channel?: string | null): string {
  if (!channel) return "";
  return channel === "voice" ? "voice (stub)" : channel;
}

export function useWorkflowRules(portfolioId?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["workflow-rules", portfolioId],
    queryFn: async () => {
      const response = await fetchApi<ApiItemResponse<Record<string, unknown>[]>>(
        client,
        "/api/v1/workflows/rules",
        { portfolio_id: portfolioId ?? "" }
      );
      return {
        ...response,
        data: response.data.map(normalizeWorkflowRule)
      } satisfies ApiItemResponse<WorkflowRule[]>;
    },
    enabled: Boolean(portfolioId)
  });
}

export function useWorkflowPackages() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["workflow-packages"],
    queryFn: () =>
      fetchApi<ApiItemResponse<WorkflowPackageSummary[]>>(
        client,
        "/api/v1/workflows/packages"
      )
  });
}

export function useWorkflowPackage(id: string, enabled = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["workflow-package", id],
    queryFn: () =>
      fetchApi<ApiItemResponse<WorkflowPackageDetail>>(
        client,
        `/api/v1/workflows/packages/${id}`
      ),
    enabled: enabled && Boolean(id)
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

export type ContactTodayItem = {
  id: string;
  channel: string;
  status: string;
  outcome: string | null;
  createdAt: string;
  debtor: { id: string; name: string } | null;
  debt: { id: string; portfolio: { id: string; name: string } | null } | null;
};

export type PromiseItem = {
  id: string;
  promisedDate: string;
  amount: string;
  createdAt: string;
  debt: {
    id: string;
    currency: string;
    amountOutstanding: string;
    portfolio: { id: string; name: string } | null;
    debtor: { id: string; name: string };
  };
};

export type EscalationItem = {
  id: string;
  createdAt: string;
  status: string;
  rule: { id: string; name: string; action: string } | null;
  debt: {
    id: string;
    portfolio: { id: string; name: string } | null;
    debtor: { id: string; name: string };
  } | null;
};

export function useWorkflowStats() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["workflow-stats"],
    queryFn: () =>
      fetchApi<ApiItemResponse<WorkflowStats>>(client, "/api/v1/workflows/stats")
  });
}

export function useContactsTodayDetail(enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["workflow-stats-contacts"],
    queryFn: () =>
      fetchApi<ApiItemResponse<ContactTodayItem[]>>(client, "/api/v1/workflows/stats/contacts"),
    enabled
  });
}

export function useActivePromisesDetail(enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["workflow-stats-promises"],
    queryFn: () =>
      fetchApi<ApiItemResponse<PromiseItem[]>>(client, "/api/v1/workflows/stats/promises"),
    enabled
  });
}

export function useEscalationsTodayDetail(enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["workflow-stats-escalations"],
    queryFn: () =>
      fetchApi<ApiItemResponse<EscalationItem[]>>(client, "/api/v1/workflows/stats/escalations"),
    enabled
  });
}

export function useToggleWorkflowRule(portfolioId?: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      patchApi(client, `/api/v1/workflows/rules/${id}`, { is_active: isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflow-rules", portfolioId] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
      toast.success("Regla actualizada");
    },
    onError: () => toast.error("No se pudo actualizar la regla")
  });
}

export function useCreateWorkflowRule(portfolioId?: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      portfolio_id: string;
      name: string;
      trigger: string;
      action: string;
      channel?: string;
      delay_hours?: number;
      priority?: number;
      condition?: Record<string, unknown>;
      template_id?: string | null;
    }) =>
      postApi<ApiItemResponse<WorkflowRule>>(client, "/api/v1/workflows/rules", {
        condition: {},
        ...body
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflow-rules", portfolioId] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
      toast.success("Regla creada");
    },
    onError: () => toast.error("No se pudo crear la regla")
  });
}

export function useUpdateWorkflowRule(portfolioId?: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      action?: string;
      channel?: string;
      delay_hours?: number;
      priority?: number;
      condition?: Record<string, unknown>;
      template_id?: string | null;
    }) => patchApi<ApiItemResponse<WorkflowRule>>(client, `/api/v1/workflows/rules/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflow-rules", portfolioId] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
      toast.success("Regla actualizada");
    },
    onError: () => toast.error("No se pudo actualizar la regla")
  });
}

export function useDeleteWorkflowRule(portfolioId?: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteApi(client, `/api/v1/workflows/rules/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflow-rules", portfolioId] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio", portfolioId] });
      toast.success("Regla eliminada");
    },
    onError: () => toast.error("No se pudo eliminar la regla")
  });
}

export function useApplyWorkflowPackage() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      packageId,
      overwrite = false
    }: {
      packageId: string;
      overwrite?: boolean;
    }) => {
      try {
        return await postApi<
          ApiItemResponse<{
            package_id: string;
            rules_created: number;
            rules_replaced: number;
          }>
        >(client, `/api/v1/workflows/packages/${packageId}/apply`, {
          overwrite
        });
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 409) {
          const body = error.response.data as {
            message?:
              | string
              | {
                  message?: string;
                  package_id?: string;
                  existing_count?: number;
                };
            package_id?: string;
            existing_count?: number;
          };
          const payload =
            typeof body.message === "object" && body.message !== null
              ? body.message
              : body;
          throw new WorkflowPackageConflictError(
            payload.package_id ?? packageId,
            payload.existing_count ?? 0,
            (typeof payload.message === "string"
              ? payload.message
              : typeof (payload as { message?: string }).message === "string"
                ? (payload as { message?: string }).message
                : undefined) ??
              "Este paquete ya fue aplicado. ¿Deseas reemplazar las reglas existentes?"
          );
        }
        throw error;
      }
    },
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["workflow-rules"] });
      const { rules_created, rules_replaced } = response.data;
      if (rules_replaced > 0) {
        toast.success(
          `Paquete aplicado: ${rules_created} reglas creadas (${rules_replaced} reemplazadas)`
        );
        return;
      }
      toast.success(`Paquete aplicado: ${rules_created} reglas creadas`);
    },
    onError: (error) => {
      if (error instanceof WorkflowPackageConflictError) {
        return;
      }
      toast.error("No se pudo aplicar el paquete");
    }
  });
}
