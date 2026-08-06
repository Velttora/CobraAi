/**
 * Extracts a message worth showing the user out of a failed request.
 *
 * The integrations screens used to report every failure as "revisa tu conexión",
 * which sent people hunting for a network problem when the server had actually
 * told them what was wrong — a missing encryption key, a rejected credential, a
 * validation error. Only a request that never got a response is a connectivity
 * problem; anything with a status code carries the server's own explanation.
 */
const NETWORK_FALLBACK = "No se pudo guardar. Revisa tu conexión e intenta de nuevo.";

interface AxiosLikeError {
  response?: { status?: number; data?: unknown };
}

function messageFromBody(data: unknown): string | null {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (!data || typeof data !== "object") return null;

  // NestJS shape: { statusCode, message, error }. `message` is a string for a
  // thrown HttpException and an array for a failed ValidationPipe.
  const message = (data as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (Array.isArray(message)) {
    const joined = message.filter((m) => typeof m === "string").join(". ");
    if (joined.trim()) return joined.trim();
  }
  return null;
}

export function apiErrorMessage(error: unknown, fallback = NETWORK_FALLBACK): string {
  const response = (error as AxiosLikeError | undefined)?.response;
  if (!response) return fallback;

  const fromBody = messageFromBody(response.data);
  if (fromBody) return fromBody;

  if (response.status === 403) return "No tienes permisos para hacer este cambio.";
  if (response.status && response.status >= 500) {
    return "El servidor falló al guardar. Revisa los logs del servicio.";
  }
  return fallback;
}
