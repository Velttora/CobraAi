import type { ApiMeta, ApiSuccessResponse } from "@cobrai/types";
import { randomUUID } from "node:crypto";
import { startOfZonedDayUtc } from "@cobrai/utils";

export function successResponse<T>(
  data: T,
  requestId?: string
): ApiSuccessResponse<T> {
  const meta: ApiMeta = {
    request_id: requestId ?? randomUUID(),
    timestamp: new Date().toISOString()
  };
  return { success: true, data, meta };
}

export function parseFilters(
  query: Record<string, unknown>
): Record<string, string> {
  const filters: Record<string, string> = {};

  // Express/qs parsea ?filter[campo]=valor como { filter: { campo: valor } }
  const nested = query.filter;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    for (const [key, value] of Object.entries(nested)) {
      if (typeof value === "string") {
        filters[key] = value;
      }
    }
  }

  for (const [key, value] of Object.entries(query)) {
    const match = /^filter\[(.+)\]$/.exec(key);
    if (match?.[1] && typeof value === "string") {
      filters[match[1]] = value;
    }
  }
  return filters;
}

export function parsePagination(query: Record<string, unknown>): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 25)));
  return { page, limit, skip: (page - 1) * limit };
}

export function parseSort(
  sortRaw: unknown,
  allowed: string[],
  defaultField = "created_at"
): { field: string; direction: "asc" | "desc" } {
  const sort = typeof sortRaw === "string" ? sortRaw : `${defaultField}:desc`;
  const [fieldRaw, dirRaw] = sort.split(":");
  const field = allowed.includes(fieldRaw ?? "") ? (fieldRaw as string) : defaultField;
  const direction = dirRaw === "asc" ? "asc" : "desc";
  return { field, direction };
}

export function decimalToNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return Number(value);
}

export function computeAgingDays(dueDate: Date): number {
  const today = startOfZonedDayUtc(new Date());
  const due = startOfZonedDayUtc(dueDate);
  const diff = today.getTime() - due.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

import type { AgingBucket } from "@cobrai/db";

export function computeAgingBucket(days: number): AgingBucket {
  if (days <= 30) return "d0_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  if (days <= 180) return "d91_180";
  return "d180_plus";
}
