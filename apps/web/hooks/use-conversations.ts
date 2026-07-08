"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchApi, patchApi, postApi, useApiClient } from "./use-api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceMessagePayload {
  call_id: string;
  transcript: string;
  summary: string | null;
}

export interface ConversationItem {
  id: string;
  channel: string;
  status: string;
  last_message_at: string | null;
  debtor: { id: string; name: string };
  portfolio: { id: string; name: string } | null;
  last_message: string | null;
  last_call_outcome: string | null;
  last_call_duration: number | null;
  last_response_status: string | null;
  last_response_attempt: number | null;
}

export interface ConversationMessage {
  id: string;
  direction: "in" | "out";
  channel: string;
  text: string;
  voice: VoiceMessagePayload | null;
  human_sent: boolean;
  status: string;
  sent_at: string;
}

export interface ConversationThread {
  total: number;
  page: number;
  limit: number;
  conversation_id: string;
  channel: string;
  status: string;
  messages: ConversationMessage[];
}

export interface ConversationListResponse {
  success: boolean;
  data: {
    total: number;
    page: number;
    limit: number;
    items: ConversationItem[];
  };
  meta: { request_id: string; timestamp: string };
}

export interface ConversationThreadResponse {
  success: boolean;
  data: ConversationThread;
  meta: { request_id: string; timestamp: string };
}

export interface EscalationsResponse {
  success: boolean;
  data: ConversationItem[];
  meta: { request_id: string; timestamp: string };
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useConversations(opts: {
  channel?: string;
  status?: string;
  outcome?: string;
  page?: number;
  limit?: number;
  portfolioId?: string;
}) {
  const client = useApiClient();
  const params: Record<string, string | number | undefined> = {
    page: opts.page ?? 1,
    limit: opts.limit ?? 25
  };
  if (opts.channel) params.channel = opts.channel;
  if (opts.status) params.status = opts.status;
  if (opts.outcome) params.outcome = opts.outcome;
  if (opts.portfolioId) params.portfolio_id = opts.portfolioId;

  return useQuery({
    queryKey: ["conversations", params],
    queryFn: () =>
      fetchApi<ConversationListResponse>(
        client,
        "/api/v1/conversations",
        params
      )
  });
}

export function useConversationThread(conversationId: string) {
  const client = useApiClient();

  return useQuery({
    queryKey: ["conversation-thread", conversationId],
    queryFn: () =>
      fetchApi<ConversationThreadResponse>(
        client,
        `/api/v1/conversations/${conversationId}/messages`
      ),
    enabled: Boolean(conversationId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false
  });
}

export function useEscalations() {
  const client = useApiClient();

  return useQuery({
    queryKey: ["escalations"],
    queryFn: () =>
      fetchApi<EscalationsResponse>(
        client,
        "/api/v1/conversations/escalations"
      ),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false
  });
}

export function useReplyConversation() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      postApi<{ success: boolean; data: { sent: boolean } }>(
        client,
        `/api/v1/conversations/${id}/reply`,
        { body }
      ),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ["conversation-thread", vars.id]
      });
    }
  });
}

export function useResolveEscalation() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, outcome, note }: { id: string; outcome: "pending" | "promised"; note?: string }) =>
      patchApi<{ success: boolean; data: { resolved: boolean; status: string } }>(
        client,
        `/api/v1/conversations/escalations/${id}/resolve`,
        { outcome, note }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["escalations"] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  });
}
