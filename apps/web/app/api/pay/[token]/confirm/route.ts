import { NextResponse } from "next/server";
import { paymentsServiceUrl } from "../../../../../lib/payments-api";

export async function POST(
  _request: Request,
  { params }: { params: { token: string } }
): Promise<NextResponse> {
  const response = await fetch(
    paymentsServiceUrl(`/v1/payments/sandbox/${params.token}/confirm`),
    { method: "POST" }
  );
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
