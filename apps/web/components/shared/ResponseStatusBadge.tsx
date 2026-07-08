import { cn } from "../../lib/utils";

const RESPONSE_STATUS_LABELS: Record<string, string> = {
  pending: "Mensaje enviado",
  effective: "Contacto efectivo",
  no_response: "Sin contacto"
};

const responseStatusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  effective: "bg-teal-50 text-[#0F6E56] dark:bg-teal-950 dark:text-teal-300",
  no_response: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
};

/** Badge para el estado de respuesta (Mensaje enviado / Contacto efectivo / Sin contacto) del intento de contacto más reciente. */
export function ResponseStatusBadge({
  status,
  attemptNumber,
  className
}: {
  status: string;
  attemptNumber?: number | null;
  className?: string;
}) {
  const label = RESPONSE_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        responseStatusStyles[status] ?? responseStatusStyles.pending,
        className
      )}
      title={attemptNumber ? `Intento ${attemptNumber}` : undefined}
    >
      {label}
    </span>
  );
}
