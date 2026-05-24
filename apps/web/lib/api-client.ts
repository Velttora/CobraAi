import axios, { type AxiosInstance } from "axios";

const DEFAULT_GATEWAY = "http://localhost:3000";

export function getGatewayOrigin(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_GATEWAY).replace(/\/$/, "");
}

export function createBrowserApiClient(
  getToken: () => Promise<string | null>,
  orgId: string | null | undefined
): AxiosInstance {
  const client = axios.create({
    baseURL: getGatewayOrigin(),
    timeout: 60_000
  });

  client.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (orgId) {
      config.headers["X-Tenant-Id"] = orgId;
    }
    return config;
  });

  return client;
}
