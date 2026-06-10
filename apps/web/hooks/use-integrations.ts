"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, postApi, deleteApi, useApiClient } from "./use-api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ErpType =
  | "sap"
  | "siigo"
  | "world_office"
  | "oracle"
  | "dynamics"
  | "custom";

export type OutboundEvent =
  | "debt.paid"
  | "debt.promise_to_pay"
  | "debt.status_changed"
  | "debt.contact_failed";

export const ALL_OUTBOUND_EVENTS: OutboundEvent[] = [
  "debt.paid",
  "debt.promise_to_pay",
  "debt.status_changed",
  "debt.contact_failed"
];

export const OUTBOUND_EVENT_LABELS: Record<OutboundEvent, string> = {
  "debt.paid": "Pago registrado",
  "debt.promise_to_pay": "Promesa de pago",
  "debt.status_changed": "Cambio de estado",
  "debt.contact_failed": "Contacto fallido"
};

export const ERP_TYPE_LABELS: Record<ErpType, string> = {
  sap: "SAP",
  siigo: "Siigo",
  world_office: "World Office",
  oracle: "Oracle ERP",
  dynamics: "Microsoft Dynamics",
  custom: "Sistema personalizado"
};

export interface ErpIntegration {
  id: string;
  name: string;
  erp_type: ErpType;
  api_key_preview: string;   // e.g. "cobra_live_••••••abc1"
  outbound_webhook_url: string | null;
  events: OutboundEvent[];
  status: "active" | "inactive";
  last_event_at: string | null;
  created_at: string;
}

export interface CreateIntegrationPayload {
  name: string;
  erp_type: ErpType;
  outbound_webhook_url?: string;
  events: OutboundEvent[];
}

export interface CreateIntegrationResponse {
  success: boolean;
  data: ErpIntegration & {
    api_key: string;  // full key — only returned on creation
  };
}

export interface IntegrationsListResponse {
  success: boolean;
  data: {
    items: ErpIntegration[];
    total: number;
  };
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useIntegrations() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["integrations"],
    queryFn: () =>
      fetchApi<IntegrationsListResponse>(client, "/api/v1/integrations")
  });
}

export function useCreateIntegration() {
  const client = useApiClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateIntegrationPayload) =>
      postApi<CreateIntegrationResponse>(
        client,
        "/api/v1/integrations",
        payload
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["integrations"] });
    }
  });
}

export function useDeleteIntegration() {
  const client = useApiClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      deleteApi<{ success: boolean }>(client, `/api/v1/integrations/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["integrations"] });
    }
  });
}

export function useTestIntegration() {
  const client = useApiClient();

  return useMutation({
    mutationFn: (id: string) =>
      postApi<{ success: boolean; delivered: boolean }>(
        client,
        `/api/v1/integrations/${id}/test`,
        {}
      )
  });
}
