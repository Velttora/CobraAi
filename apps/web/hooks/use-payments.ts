"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ApiItemResponse } from "../lib/types";
import { postApi, useApiClient } from "./use-api-client";

export type PaymentLink = {
  link_id: string;
  url: string;
  expires_at: string;
  amount: number;
  currency: string;
  gateway: string;
};

export function useCreatePaymentLink() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (body: { debt_id: string; amount?: number }) =>
      postApi<ApiItemResponse<PaymentLink>>(client, "/api/v1/payment-links", body),
    onSuccess: (res) => {
      toast.success("Link de pago generado");
      if (res.data.url) {
        void navigator.clipboard.writeText(res.data.url);
        toast.message("URL copiada al portapapeles");
      }
    },
    onError: () => toast.error("No se pudo generar el link")
  });
}
