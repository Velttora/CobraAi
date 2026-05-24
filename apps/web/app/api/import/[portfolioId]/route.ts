import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

function portfoliosBaseUrl(): string {
  return (
    process.env.SERVICE_PORTFOLIOS_URL ??
    process.env.NEXT_PUBLIC_API_URL?.replace(":3000", ":3001") ??
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

async function authHeaders(): Promise<HeadersInit> {
  const { getToken, orgId } = await auth();
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (orgId) headers["X-Tenant-Id"] = orgId;
  return headers;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ portfolioId: string }> }
): Promise<NextResponse> {
  const { portfolioId } = await context.params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: { message: "Archivo requerido" } },
      { status: 400 }
    );
  }

  const forward = new FormData();
  forward.append("file", file);
  const headers = await authHeaders();

  const upstream = await fetch(
    `${portfoliosBaseUrl()}/api/v1/portfolios/${portfolioId}/import`,
    { method: "POST", headers, body: forward }
  );
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": "application/json" }
  });
}
