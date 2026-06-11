export type SuggestedChannel = "whatsapp" | "voice" | "email";

export type DebtorContactSnapshot = {
  email?: string | null;
  phones?: string[];
  whatsappOptIn?: boolean;
};

export function isChannelAvailableForDebtor(
  channel: string | null | undefined,
  debtor: DebtorContactSnapshot
): boolean {
  if (!channel) return false;
  const phones = (debtor.phones ?? []).filter(Boolean);
  const hasEmail = Boolean(debtor.email?.trim());
  switch (channel as SuggestedChannel) {
    case "whatsapp":
      return Boolean(debtor.whatsappOptIn) && phones.length > 0;
    case "voice":
      return phones.length > 0;
    case "email":
      return hasEmail;
    default:
      return false;
  }
}

export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return "Sin canal disponible";
  const labels: Record<string, string> = {
    whatsapp: "WhatsApp",
    voice: "Voz",
    email: "Email",
    sms: "WhatsApp"
  };
  return labels[channel] ?? channel;
}

/**
 * Resuelve el canal efectivo a usar dado el canal sugerido por el scoring y la
 * disponibilidad actual del deudor. Si el sugerido no está disponible, busca un
 * fallback en orden: whatsapp → voice → email.
 */
export function resolveContactChannel(
  suggestedChannel: string | null | undefined,
  debtor: DebtorContactSnapshot
): {
  channel: SuggestedChannel | null;
  isFallback: boolean;
  originalSuggested: SuggestedChannel | null;
} {
  const original = (suggestedChannel as SuggestedChannel) ?? null;

  if (original && isChannelAvailableForDebtor(original, debtor)) {
    return { channel: original, isFallback: false, originalSuggested: original };
  }

  const FALLBACK_ORDER: SuggestedChannel[] = ["whatsapp", "voice", "email"];
  for (const ch of FALLBACK_ORDER) {
    if (ch !== original && isChannelAvailableForDebtor(ch, debtor)) {
      return { channel: ch, isFallback: true, originalSuggested: original };
    }
  }

  return { channel: null, isFallback: true, originalSuggested: original };
}
