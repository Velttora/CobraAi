const DEFAULT_LOCALE = "es-CO";

/**
 * Formatea montos en moneda LATAM (por defecto COP).
 */
export function formatCurrency(
  amount: number,
  currency = "COP",
  locale = DEFAULT_LOCALE
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "COP" ? 0 : 2
  }).format(amount);
}
