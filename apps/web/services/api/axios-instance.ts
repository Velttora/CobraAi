import axios from "axios";

const DEFAULT_ORIGIN = "http://localhost:4000";

export function getApiOrigin(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_ORIGIN).replace(/\/$/, "");
}

export const apiClient = axios.create({
  baseURL: `${getApiOrigin()}/api`,
  timeout: 120_000
});
