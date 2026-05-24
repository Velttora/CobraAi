const PAYMENTS_BASE =
  process.env.PAYMENTS_SERVICE_URL ?? "http://localhost:3004";

export function paymentsServiceUrl(path: string): string {
  return `${PAYMENTS_BASE.replace(/\/$/, "")}/api${path.startsWith("/") ? path : `/${path}`}`;
}
