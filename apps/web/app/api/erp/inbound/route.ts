import { NextResponse } from "next/server";
import { getGatewayOrigin } from "../../../../lib/api-client";

/**
 * Endpoint público que los ERP usan para enviar cartera a CobraAI.
 * El ERP debe incluir el header X-Api-Key con la clave de la integración.
 * CobraAI valida la clave en el backend y asocia los datos al tenant correcto.
 *
 * POST /api/erp/inbound
 * X-Api-Key: cobra_live_...
 * Content-Type: application/json
 *
 * Body: { portfolio_id, debts: [...] }
 */
export async function POST(request: Request): Promise<NextResponse> {
  const apiKey = request.headers.get("X-Api-Key");

  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "Header X-Api-Key requerido" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Body JSON inválido" },
      { status: 400 }
    );
  }

  const upstream = await fetch(
    `${getGatewayOrigin()}/api/v1/integrations/ingest`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey
      },
      body: JSON.stringify(body)
    }
  );

  const responseText = await upstream.text();

  return new NextResponse(responseText, {
    status: upstream.status,
    headers: { "content-type": "application/json" }
  });
}
