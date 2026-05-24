/**
 * Normaliza teléfono LATAM a E.164 básico (Colombia +57 por defecto).
 */
export function normalizePhoneE164(
  phone: string,
  defaultCountryCode = "57"
): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) {
    return null;
  }
  if (digits.startsWith(defaultCountryCode)) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+${defaultCountryCode}${digits}`;
  }
  return digits.startsWith("+") ? phone : `+${digits}`;
}
