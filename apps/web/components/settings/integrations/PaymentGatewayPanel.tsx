"use client";

import { useAuth } from "@clerk/nextjs";
import { validateExternalLinkTemplate } from "@cobrai/utils";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../../shared/ConfirmDialog";
import { CopyButton } from "../../shared/CopyButton";
import { useIntegrations, useSaveIntegration, useVerifyIntegration } from "../../../hooks/use-integrations";
import { usePaymentFocusHighlight } from "../../../hooks/use-payment-focus-highlight";
import type { IntegrationView } from "../../../lib/types";
import { cn } from "../../../lib/utils";
import { ExternalLinkTemplateEditor } from "./ExternalLinkTemplateEditor";
import { PaymentCredentialFields } from "./PaymentCredentialFields";
import { PaymentPanelHeader } from "./PaymentPanelHeader";
import {
  PAYMENT_PROVIDER_FIELDS,
  PAYMENT_PROVIDER_PRECEDENCE,
  displayNameFor,
  providerLabel
} from "./payment-providers";
import { PaymentProviderSelect } from "./PaymentProviderSelect";
import { PaymentReadOnlyView } from "./PaymentReadOnlyView";
import { PaymentVerificationFailure } from "./PaymentVerificationFailure";

const DEFAULT_PROVIDER = "wompi";
const CONFIGURED_ONLY_PROVIDERS = new Set(["external_link", "transfer"]);

function emptyView(provider: string): IntegrationView {
  return {
    provider,
    channel: "payments",
    mode: "byo",
    status: "not_configured",
    verifiedAt: null,
    failureMessage: null,
    publicConfig: {},
    secrets: [],
    webhookUrl: null
  };
}

/**
 * Screen 2, `Configuración de cobro` (08-UI-SPEC.md). Payments are BYO-only
 * (D-06) — this panel never renders a managed/BYO toggle, a disabled
 * managed pill, or a "coming soon" affordance for a partner path that does
 * not exist; the BYO-only line rendered by `PaymentPanelHeader` is the only
 * mode-related copy on this screen.
 */
export function PaymentGatewayPanel(): React.ReactElement {
  const { orgRole } = useAuth();
  const isAdmin = (orgRole?.replace(/^org:/, "") ?? "viewer") === "admin";
  const searchParams = useSearchParams();

  const integrationsQuery = useIntegrations();
  const saveIntegration = useSaveIntegration();
  const verifyIntegration = useVerifyIntegration();

  const paymentsItems = (integrationsQuery.data?.data.items ?? []).filter((i) => i.channel === "payments");
  const activeProvider =
    PAYMENT_PROVIDER_PRECEDENCE.find(
      (p) => paymentsItems.find((i) => i.provider === p)?.status !== "not_configured"
    ) ?? null;

  const [draftProvider, setDraftProvider] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [publicDraft, setPublicDraft] = useState<Record<string, string>>({});
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string | null>>({});
  const [externalLinkTemplate, setExternalLinkTemplate] = useState<string | null>(null);

  const selectedProvider = draftProvider ?? activeProvider ?? DEFAULT_PROVIDER;
  const currentView = paymentsItems.find((i) => i.provider === selectedProvider) ?? emptyView(selectedProvider);
  const isSaving = saveIntegration.isPending || verifyIntegration.isPending;
  const displayStatus = isSaving ? "verifying" : currentView.status;
  const templateValue = externalLinkTemplate ?? currentView.publicConfig["template"] ?? "";

  const { ref: articleRef, highlighted } = usePaymentFocusHighlight(searchParams.get("focus"));

  useEffect(() => {
    setPublicDraft({});
    setSecretDrafts({});
    setExternalLinkTemplate(null);
  }, [selectedProvider, currentView.verifiedAt, currentView.failureMessage]);

  function handleProviderChange(next: string): void {
    if (activeProvider && next !== selectedProvider) {
      setPendingProvider(next);
      return;
    }
    setDraftProvider(next);
  }

  function fieldValue(name: string): string {
    return publicDraft[name] ?? currentView.publicConfig[name] ?? "";
  }

  const fields = PAYMENT_PROVIDER_FIELDS[selectedProvider] ?? [];
  const publicFields = fields.filter((f) => f.target === "publicConfig");
  const secretFields = fields.filter((f) => f.secret);

  const isValid =
    selectedProvider === "external_link"
      ? validateExternalLinkTemplate(templateValue).length === 0
      : publicFields.every((f) => fieldValue(f.name).trim() !== "") &&
        secretFields.every((f) => {
          const meta = currentView.secrets.find((s) => s.field === f.name) ?? null;
          return meta !== null || (secretDrafts[f.name] ?? null) !== null;
        });

  const isDirty =
    selectedProvider !== activeProvider ||
    publicFields.some((f) => fieldValue(f.name) !== (currentView.publicConfig[f.name] ?? "")) ||
    Object.values(secretDrafts).some((v) => v !== null && v !== undefined) ||
    (selectedProvider === "external_link" && templateValue !== (currentView.publicConfig["template"] ?? ""));

  function reportResult(status: IntegrationView["status"]): void {
    if (status === "verified") {
      toast.success("Credenciales verificadas");
    } else if (status === "failed") {
      toast.error("No pudimos verificar las credenciales");
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!isValid || isSaving) return;

    const publicConfig: Record<string, string> = {};
    for (const f of publicFields) publicConfig[f.name] = fieldValue(f.name);
    if (selectedProvider === "external_link") publicConfig["template"] = templateValue;

    const secrets: Record<string, string> = {};
    for (const f of secretFields) {
      const v = secretDrafts[f.name];
      if (v) secrets[f.name] = v;
    }

    try {
      const result = await saveIntegration.mutateAsync({
        provider: selectedProvider,
        input: { mode: "byo", publicConfig, secrets }
      });
      reportResult(result.data.status);
      if (result.data.status === "verified") {
        setPublicDraft({});
        setSecretDrafts({});
      }
    } catch {
      toast.error("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
    }
  }

  async function handleRetry(): Promise<void> {
    try {
      const result = await verifyIntegration.mutateAsync(selectedProvider);
      reportResult(result.data.status);
    } catch {
      toast.error("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
    }
  }

  return (
    <article
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900",
        highlighted && "ring-2 ring-[#D85A30]/40 motion-reduce:ring-0"
      )}
      ref={articleRef}
    >
      <PaymentPanelHeader
        configuredOnly={CONFIGURED_ONLY_PROVIDERS.has(selectedProvider)}
        isSaving={isSaving}
        provider={selectedProvider}
        status={displayStatus}
        verifiedAt={currentView.verifiedAt}
      >
        {integrationsQuery.isLoading ? (
          <p className="mt-4 text-sm text-slate-500">Cargando…</p>
        ) : integrationsQuery.isError ? (
          <p className="mt-4 text-sm text-[#A32D2D]">No se pudo cargar la configuración de cobro.</p>
        ) : isAdmin ? (
          <>
            {!activeProvider && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                <p className="font-medium text-slate-900 dark:text-slate-100">Todavía no puedes cobrar</p>
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  Elige una pasarela o pega tu enlace de pago. Sin esto, los mensajes salen sin enlace y el deudor
                  no tiene por dónde pagarte.
                </p>
              </div>
            )}

            <form className="mt-4 max-w-md space-y-4" onSubmit={(e) => void handleSubmit(e)}>
              <PaymentProviderSelect disabled={isSaving} onChange={handleProviderChange} value={selectedProvider} />

              {selectedProvider === "stripe" && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Stripe no procesa PSE ni billeteras colombianas, y requiere una entidad en Estados Unidos.
                </p>
              )}
              {CONFIGURED_ONLY_PROVIDERS.has(selectedProvider) && (
                <p className="text-xs text-slate-500">
                  Sin confirmación automática. Tendrás que marcar los pagos manualmente en el tablero; cuando el
                  deudor diga que ya pagó, la deuda queda como promesa de pago pendiente de confirmar.
                </p>
              )}

              <PaymentCredentialFields
                disabled={isSaving}
                fields={fields}
                getValue={fieldValue}
                onPublicChange={(name, value) => setPublicDraft((prev) => ({ ...prev, [name]: value }))}
                onSecretChange={(name, value) => setSecretDrafts((prev) => ({ ...prev, [name]: value }))}
                secrets={currentView.secrets}
              />
              {selectedProvider === "external_link" && (
                <ExternalLinkTemplateEditor
                  disabled={isSaving}
                  onChange={setExternalLinkTemplate}
                  value={templateValue}
                />
              )}

              <button
                className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c24f29] disabled:opacity-60"
                disabled={isSaving || !isDirty || !isValid}
                type="submit"
              >
                {isSaving ? "Verificando…" : "Guardar y verificar"}
              </button>
              {isSaving && (
                <p className="text-xs text-slate-500">
                  Estamos probando las credenciales contra el proveedor. Puede tardar unos segundos.
                </p>
              )}
            </form>

            {currentView.status === "failed" && !isSaving && (
              <PaymentVerificationFailure
                disabled={isSaving}
                failureMessage={currentView.failureMessage}
                onRetry={() => void handleRetry()}
                provider={selectedProvider}
              />
            )}

            {currentView.webhookUrl && (
              <div className="mt-4 flex items-start justify-between gap-2 text-xs text-slate-500">
                <p>
                  Pega esta URL en la consola de {displayNameFor(selectedProvider)} para que confirmemos los pagos
                  automáticamente.
                  <br />
                  <span className="break-all font-mono">{currentView.webhookUrl}</span>
                </p>
                <CopyButton label="URL del webhook" value={currentView.webhookUrl} />
              </div>
            )}
          </>
        ) : (
          <PaymentReadOnlyView
            activeProvider={activeProvider}
            secrets={currentView.secrets}
            selectedProvider={selectedProvider}
          />
        )}
      </PaymentPanelHeader>

      {pendingProvider && activeProvider && (
        <ConfirmDialog
          body={`Se borran las credenciales de ${displayNameFor(activeProvider)} y los enlaces de pago que ya enviaste a tus deudores dejarán de generarse con esa pasarela. Los enlaces ya emitidos siguen funcionando.`}
          confirmLabel="Cambiar de proveedor"
          onClose={() => setPendingProvider(null)}
          onConfirm={() => {
            setDraftProvider(pendingProvider);
            setPendingProvider(null);
          }}
          title={`¿Cambiar a ${providerLabel(pendingProvider)}?`}
          tone="danger"
        />
      )}
    </article>
  );
}
