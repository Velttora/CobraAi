"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ApiItemResponse, ApiListResponse } from "../lib/types";
import {
  notifyManualContactResult,
  type ManualContactResult
} from "../lib/contact-feedback";
import { deleteApi, fetchApi, patchApi, postApi, useApiClient } from "./use-api-client";

export type NotificationTemplate = {
  id: string;
  name: string;
  channel: string;
  subject?: string | null;
  content: string;
  variables: string[];
  isApproved: boolean;
  language: string;
};

export type ConversationMessage = {
  id: string;
  channel: string;
  direction: string;
  content: string;
  status: string;
  sent_at: string;
};

export function useTemplates() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["templates"],
    queryFn: () =>
      fetchApi<ApiListResponse<NotificationTemplate>>(client, "/api/v1/templates")
  });
}

export function useCreateTemplate() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      channel: string;
      subject?: string;
      content: string;
      variables?: string[];
      language?: string;
      is_approved?: boolean;
    }) => postApi<ApiItemResponse<NotificationTemplate>>(client, "/api/v1/templates", body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template creado");
    },
    onError: () => toast.error("No se pudo crear el template")
  });
}

export function useUpdateTemplate() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name: string;
      channel: string;
      subject?: string;
      content: string;
      variables?: string[];
    }) =>
      patchApi<ApiItemResponse<NotificationTemplate>>(
        client,
        `/api/v1/templates/${id}`,
        body
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template actualizado");
    },
    onError: () => toast.error("No se pudo actualizar el template")
  });
}

export function useDeleteTemplate() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      deleteApi<ApiItemResponse<NotificationTemplate>>(
        client,
        `/api/v1/templates/${id}`
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Template eliminado");
    },
    onError: () => toast.error("No se pudo eliminar el template")
  });
}

export function useConversation(debtorId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["conversation", debtorId],
    queryFn: () =>
      fetchApi<
        ApiItemResponse<{
          debtor_id: string;
          debtor_name: string;
          messages: ConversationMessage[];
        }>
      >(client, `/api/v1/conversations/${debtorId}`)
  });
}

export function useCreateContact() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      debt_id: string;
      channel: string;
      template_id?: string;
    }) =>
      postApi<ApiItemResponse<ManualContactResult>>(
        client,
        "/api/v1/contacts",
        body
      ),
    onSuccess: (response) => {
      notifyManualContactResult(response.data);
      void queryClient.invalidateQueries({ queryKey: ["conversation"] });
      void queryClient.invalidateQueries({ queryKey: ["debt-timeline"] });
      void queryClient.invalidateQueries({ queryKey: ["debt"] });
      void queryClient.invalidateQueries({ queryKey: ["calls"] });
    },
    onError: () =>
      toast.error("No se pudo enviar el contacto", {
        description: "Ocurrió un error de red o del servidor. Intenta de nuevo."
      })
  });
}
