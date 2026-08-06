import type { IntegrationProvider } from "@cobrai/db";
import type { VerificationResult } from "../types";

export type VerifierInput = { publicConfig: Record<string, string>; secrets: Record<string, string> };

/**
 * `GET /2010-04-01/Accounts/{accountSid}.json` with HTTP Basic auth. On
 * success, merges the account's friendly name into `publicConfig`; on a
 * non-200, surfaces Twilio's own response body verbatim (never a rewritten
 * message) so the UI's failure block shows the provider's real reason.
 */
export async function verifyTwilioAccount(
  provider: IntegrationProvider,
  input: VerifierInput
): Promise<VerificationResult> {
  const accountSid = input.publicConfig["accountSid"] ?? "";
  const authToken = input.secrets["authToken"] ?? "";
  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: { Authorization: `Basic ${auth}` }
    });
    if (!response.ok) {
      const detail = await response.text();
      return { ok: false, message: detail };
    }
    const data = (await response.json()) as { friendly_name?: string };
    return {
      ok: true,
      publicConfig: data.friendly_name ? { twilioFriendlyName: data.friendly_name } : {}
    };
  } catch {
    return { ok: false, message: `No se pudo contactar a ${provider}` };
  }
}

/** Reuses the Twilio account check and additionally requires a configured outbound number. */
export async function verifyTwilioVoice(
  provider: IntegrationProvider,
  input: VerifierInput
): Promise<VerificationResult> {
  const accountResult = await verifyTwilioAccount(provider, input);
  if (!accountResult.ok) return accountResult;
  if (!input.publicConfig["outboundNumber"]) {
    return { ok: false, message: "Falta el número saliente" };
  }
  return accountResult;
}

interface SendGridDnsEntry {
  valid?: boolean;
  type?: string;
  host?: string;
  data?: string;
}

interface SendGridDomainAuth {
  valid?: boolean;
  dns?: Record<string, SendGridDnsEntry>;
}

/**
 * `GET /v3/scopes` confirms the API key works. When a sending domain is
 * configured, an additional `GET /v3/whitelabel/domains?domain=` call
 * distinguishes "valid credentials, domain not yet authenticated" from
 * outright failure and surfaces the CNAME records the UI's DnsRecordsTable
 * needs.
 */
export async function verifySendGrid(
  provider: IntegrationProvider,
  input: VerifierInput
): Promise<VerificationResult> {
  const apiKey = input.secrets["apiKey"] ?? "";
  try {
    const response = await fetch("https://api.sendgrid.com/v3/scopes", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!response.ok) {
      const detail = await response.text();
      return { ok: false, message: detail };
    }

    const domain = input.publicConfig["domain"];
    if (!domain) return { ok: true };

    const domainResponse = await fetch(
      `https://api.sendgrid.com/v3/whitelabel/domains?domain=${encodeURIComponent(domain)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!domainResponse.ok) {
      // Credentials are valid (the scopes call succeeded); a failed domain lookup
      // still leaves the tenant able to authenticate the domain, so degrade to
      // pending rather than failing the whole integration.
      return { ok: true, status: "pending_dns" };
    }

    const domains = (await domainResponse.json()) as SendGridDomainAuth[];
    const match = domains[0];
    if (match && match.valid) {
      return { ok: true };
    }

    const dnsRecords = Object.values(match?.dns ?? {}).map((entry) => ({
      type: "CNAME" as const,
      host: entry.host ?? "",
      value: entry.data ?? "",
      verified: Boolean(entry.valid)
    }));

    return {
      ok: true,
      status: "pending_dns",
      // publicConfig is a JSON blob at rest; dnsRecords is deliberately a
      // structured array here even though the type signature is loosely
      // Record<string, string> for the common scalar-config case.
      publicConfig: dnsRecords.length ? ({ dnsRecords } as unknown as Record<string, string>) : {}
    };
  } catch {
    return { ok: false, message: `No se pudo contactar a ${provider}` };
  }
}
