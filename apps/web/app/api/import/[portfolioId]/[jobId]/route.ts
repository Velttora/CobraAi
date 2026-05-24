import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

function portfoliosBaseUrl(): string {
  return (
    process.env.SERVICE_PORTFOLIOS_URL ??
    process.env.NEXT_PUBLIC_API_URL?.replace(":3000", ":3001") ??
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ portfolioId: string; jobId: string }> }
): Promise<NextResponse> {
  const { portfolioId, jobId } = await context.params;
  const { getToken, orgId } = await auth();
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (orgId) headers["X-Tenant-Id"] = orgId;

  const upstream = await fetch(
    `${portfoliosBaseUrl()}/api/v1/portfolios/${portfolioId}/import/${jobId}`,
    { headers }
  );
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": "application/json" }
  });
}
