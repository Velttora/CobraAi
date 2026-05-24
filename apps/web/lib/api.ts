import axios, { type AxiosInstance } from "axios";
import { auth } from "@clerk/nextjs/server";
import { getGatewayOrigin } from "./api-client";

/** Cliente Axios para Server Components / Server Actions. */
export async function getServerApiClient(): Promise<AxiosInstance> {
  const { getToken, orgId } = await auth();
  const token = await getToken();

  return axios.create({
    baseURL: getGatewayOrigin(),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(orgId ? { "X-Tenant-Id": orgId } : {})
    },
    timeout: 60_000
  });
}

/** Cliente base para Client Components — ver lib/api-client.ts */
