import { randomUUID } from "node:crypto";

type ApiMeta = {
  request_id: string;
  timestamp: string;
};

export function successResponse<T>(
  data: T,
  requestId?: string
): { success: true; data: T; meta: ApiMeta } {
  return {
    success: true,
    data,
    meta: {
      request_id: requestId ?? randomUUID(),
      timestamp: new Date().toISOString()
    }
  };
}
