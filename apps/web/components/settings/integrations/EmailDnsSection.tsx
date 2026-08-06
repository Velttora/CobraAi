"use client";

import { toast } from "sonner";
import { useRecheckDns } from "../../../hooks/use-integrations";
import type { IntegrationView } from "../../../lib/types";
import { DnsRecordsTable } from "./DnsRecordsTable";
import { apiErrorMessage } from "../../../lib/api-error";

export interface EmailDnsSectionProps {
  integration?: IntegrationView;
}

/**
 * D-03 DNS/CNAME lifecycle inside the Correo card — the only piece plan
 * 08-17 Task 2 adds. Kept out of `EmailFields`/`ChannelCard` as its own file
 * (a deviation from the plan's literal "wire it into ChannelCard's email
 * branch" instruction, required by the 300-line file-size rule) so it can
 * own the `useRecheckDns()` call independently, the same "any client
 * component reads its own hook" pattern 08-16-SUMMARY.md established for
 * `IntegrationsTabs`/`IntegrationSetupBanner`.
 */
export function EmailDnsSection({ integration }: EmailDnsSectionProps): React.ReactElement | null {
  const recheckDns = useRecheckDns();
  const records = integration?.dnsRecords ?? [];

  if (records.length === 0) return null;

  async function handleRecheck(): Promise<void> {
    try {
      await recheckDns.mutateAsync();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const table = (
    <DnsRecordsTable isRechecking={recheckDns.isPending} onRecheck={() => void handleRecheck()} records={records} />
  );

  if (integration?.status === "verified") {
    const replyDomain = integration.publicConfig.replyDomain;
    return (
      <div className="mt-4">
        <details>
          <summary className="cursor-pointer text-sm text-[#D85A30] hover:underline">
            Ver registros DNS publicados
          </summary>
          <div className="mt-2">{table}</div>
        </details>
        {replyDomain && (
          <p className="mt-2 text-xs text-slate-500">
            Las respuestas de tus deudores llegan a reply@{replyDomain}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4">
      {integration?.status === "pending_dns" && (
        <p className="mb-2 text-xs text-slate-500">
          Entra al panel de tu dominio y crea estos 3 registros CNAME. Puede tardar hasta 48 horas en propagarse.
        </p>
      )}
      {table}
    </div>
  );
}
