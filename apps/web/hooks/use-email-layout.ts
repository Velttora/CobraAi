"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { EmailLayoutConfig } from "@cobrai/utils/email-layout";
import type { ApiItemResponse } from "../lib/types";
import { fetchApi, postApi, putApi, useApiClient } from "./use-api-client";

export type EmailLayoutResponse = {
  draft: EmailLayoutConfig;
  published: EmailLayoutConfig | null;
  published_at: string | null;
  has_published: boolean;
};

export function useEmailLayout() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["email-layout"],
    queryFn: () =>
      fetchApi<ApiItemResponse<EmailLayoutResponse>>(client, "/api/v1/email-layout")
  });
}

export function useSaveEmailLayoutDraft() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: EmailLayoutConfig) =>
      putApi<ApiItemResponse<EmailLayoutResponse>>(
        client,
        "/api/v1/email-layout",
        config
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["email-layout"] });
      toast.success("Borrador guardado");
    },
    onError: () => toast.error("No se pudo guardar el borrador")
  });
}

export function usePublishEmailLayout() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      postApi<ApiItemResponse<EmailLayoutResponse>>(
        client,
        "/api/v1/email-layout/publish"
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["email-layout"] });
      toast.success("Plantilla publicada");
    },
    onError: () => toast.error("No se pudo publicar la plantilla")
  });
}
