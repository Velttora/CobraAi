"use client";

import { useAuth } from "@clerk/nextjs";
import axios, { type AxiosInstance } from "axios";
import { useMemo } from "react";
import { createBrowserApiClient } from "../lib/api-client";

export function useApiClient(): AxiosInstance {
  const { getToken, orgId } = useAuth();

  return useMemo(
    () =>
      createBrowserApiClient(
        () => getToken(),
        orgId
      ),
    [getToken, orgId]
  );
}

export async function fetchApi<T>(
  client: AxiosInstance,
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  const { data } = await client.get<T>(path, { params });
  return data;
}

export async function postApi<T>(
  client: AxiosInstance,
  path: string,
  body?: unknown
): Promise<T> {
  const { data } = await client.post<T>(path, body);
  return data;
}

export async function patchApi<T>(
  client: AxiosInstance,
  path: string,
  body: unknown
): Promise<T> {
  const { data } = await client.patch<T>(path, body);
  return data;
}

export async function uploadFile<T>(
  client: AxiosInstance,
  path: string,
  file: File
): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await client.post<T>(path, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300_000
  });
  return data;
}
