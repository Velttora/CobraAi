import { NextResponse } from "next/server";
import { paymentsServiceUrl } from "../../../../lib/payments-api";

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
): Promise<NextResponse> {
  try {
    const response = await fetch(
      paymentsServiceUrl(`/v1/payment-links/${params.token}`),
      { cache: "no-store" }
    );
    const data = await response.json().catch(() => ({
      message: "Link de pago no encontrado"
    }));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "Link de pago no disponible" },
      { status: 503 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { token: string } }
): Promise<NextResponse> {
  const body = await request.json().catch(() => ({}));
  const response = await fetch(
    paymentsServiceUrl(`/v1/payments/checkout/${params.token}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
