/** Origins allowed for CORS and Clerk JWT `azp` (comma-separated WEB_ORIGIN). */
export function parseWebOrigins(raw?: string): string[] {
  const fromEnv = (raw ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (fromEnv.length > 0) {
    return fromEnv;
  }

  return ["http://localhost:3001", "http://localhost:3000"];
}

export function isAllowedCorsOrigin(origin: string, allowed: string[]): boolean {
  if (allowed.includes(origin)) {
    return true;
  }
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}
