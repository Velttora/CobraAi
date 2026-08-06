"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApiItemResponse,
  IntegrationView,
  SaveIntegrationInput,
  UncontactedDebt
} from "../lib/types";
import { deleteApi, fetchApi, postApi, putApi, useApiClient } from "./use-api-client";

// ── Response shapes ──────────────────────────────────────────────────────────
// Mirrors the "Final Endpoint List" in 08-14-SUMMARY.md exactly.

interface IntegrationListData {
  items: IntegrationView[];
}

interface IntegrationHealthData {
  items: IntegrationView[];
  summary: { operational: number; total: number };
}

interface UncontactedDebtsData {
  items: UncontactedDebt[];
  total: number;
  page: number;
}

/** Request body for `POST /api/v1/integrations/whatsapp/embedded-signup` (D-25). */
export interface EmbeddedSignupInput {
  wabaId: string;
  phoneNumberId: string;
  phoneNumberE164: string;
  businessName: string;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useIntegrations() {
  const client = useApiClient();

  return useQuery({
    queryKey: ["integrations"],
    queryFn: () =>
      fetchApi<ApiItemResponse<IntegrationListData>>(client, "/api/v1/integrations")
  });
}

export function useIntegrationHealth() {
  const client = useApiClient();

  return useQuery({
    queryKey: ["integrations", "health"],
    queryFn: () =>
      fetchApi<ApiItemResponse<IntegrationHealthData>>(client, "/api/v1/integrations/health")
  });
}

export function useUncontactedDebts(page: number) {
  const client = useApiClient();

  return useQuery({
    queryKey: ["integrations", "uncontacted-debts", { page }],
    queryFn: () =>
      fetchApi<ApiItemResponse<UncontactedDebtsData>>(
        client,
        "/api/v1/integrations/uncontacted-debts",
        { page }
      )
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────
//
// D-26: the request type (SaveIntegrationInput/EmbeddedSignupInput) carries
// `secrets`, but every mutation response type here is IntegrationView, which
// only ever carries `lastFour`/`savedAt` — this asymmetry is deliberate so a
// secret can never enter the React Query cache by construction, not merely
// by convention. A secret field the caller leaves untouched is simply absent
// from `SaveIntegrationInput.secrets`, so the backend preserves it.

export function useSaveIntegration() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, input }: { provider: string; input: SaveIntegrationInput }) =>
      putApi<ApiItemResponse<IntegrationView>>(client, `/api/v1/integrations/${provider}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      void queryClient.invalidateQueries({ queryKey: ["integrations", "health"] });
    }
  });
}

export function useDisconnectIntegration() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: string) =>
      deleteApi<ApiItemResponse<IntegrationView>>(client, `/api/v1/integrations/${provider}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      void queryClient.invalidateQueries({ queryKey: ["integrations", "health"] });
    }
  });
}

export function useVerifyIntegration() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: string) =>
      postApi<ApiItemResponse<IntegrationView>>(client, `/api/v1/integrations/${provider}/verify`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      void queryClient.invalidateQueries({ queryKey: ["integrations", "health"] });
    }
  });
}

export function useEmbeddedSignup() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: EmbeddedSignupInput) =>
      postApi<ApiItemResponse<IntegrationView>>(
        client,
        "/api/v1/integrations/whatsapp/embedded-signup",
        body
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      void queryClient.invalidateQueries({ queryKey: ["integrations", "health"] });
    }
  });
}

export function useRecheckDns() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      postApi<ApiItemResponse<IntegrationView>>(client, "/api/v1/integrations/email/recheck-dns"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations"] });
      void queryClient.invalidateQueries({ queryKey: ["integrations", "health"] });
    }
  });
}
