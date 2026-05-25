"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi, useApiClient } from "./use-api-client";

export interface VoiceCall {
  id: string;
  channel: string;
  status: string;
  outcome: string | null;
  durationSeconds: number | null;
  transcriptUrl: string | null;
  createdAt: string;
  debtor: { id: string; name: string } | null;
}

export interface CallsResponse {
  success: boolean;
  data: { items: VoiceCall[] };
  meta: { request_id: string; timestamp: string };
}

export function useCalls(opts: { outcome?: string } = {}) {
  const client = useApiClient();
  const params: Record<string, string | undefined> = { channel: "voice" };
  if (opts.outcome) params.outcome = opts.outcome;

  return useQuery({
    queryKey: ["calls", params],
    queryFn: () =>
      fetchApi<CallsResponse>(client, "/api/v1/contacts", params)
  });
}
