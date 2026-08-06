"use client";

import { useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { IntegrationView, SaveIntegrationInput } from "../../../lib/types";
import {
  useDisconnectIntegration,
  useSaveIntegration,
  useVerifyIntegration
} from "../../../hooks/use-integrations";
import { ConfirmDialog } from "../../shared/ConfirmDialog";
import { CHANNEL_COPY, PROVIDER_BY_CHANNEL, REQUIRED_FIELDS, type ChannelId } from "./channel-config";
import { ChannelFailureBlock } from "./ChannelFailureBlock";
import { ChannelModeToggle } from "./ChannelModeToggle";
import { EmailFields } from "./EmailFields";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";
import { PhoneFields } from "./PhoneFields";
import { ReadOnlyChannelSummary } from "./ReadOnlyChannelSummary";
import { WhatsAppFields } from "./WhatsAppFields";

export interface ChannelCardProps {
  channel: ChannelId;
  integration?: IntegrationView;
  relatedIntegration?: IntegrationView;
  onSaved?: () => void;
}

const NETWORK_ERROR_TOAST = "No se pudo guardar. Revisa tu conexión e intenta de nuevo.";
const FOCUS_RING_MS = 2000;

/**
 * Canonical `OrganizationSettingsPanel` shell, one per channel. Body order is
 * fixed (08-UI-SPEC.md "Screen 1"): description → mode toggle → connection
 * area → status/failure block. All draft/save/verify/disconnect logic lives
 * here; the per-channel field layouts (`WhatsAppFields`/`PhoneFields`/
 * `EmailFields`) are presentational, driven by `ChannelFormProps`.
 */
export function ChannelCard({
  channel,
  integration,
  relatedIntegration,
  onSaved
}: ChannelCardProps): React.ReactElement {
  const { orgRole } = useAuth();
  const isAdmin = (orgRole?.replace(/^org:/, "") ?? "viewer") === "admin";
  const copy = CHANNEL_COPY[channel];
  const provider = PROVIDER_BY_CHANNEL[channel];
  const searchParams = useSearchParams();
  const cardRef = useRef<HTMLElement>(null);

  const savedMode = integration?.mode ?? "managed";
  const status = integration?.status ?? "not_configured";
  const secretsMeta = integration?.secrets ?? [];
  const savedPublic = integration?.publicConfig ?? {};

  const [modeDraft, setModeDraft] = useState<"managed" | "byo" | null>(null);
  const [publicDraft, setPublicDraft] = useState<Record<string, string>>({});
  const [secretDraft, setSecretDraft] = useState<Record<string, string | null>>({});
  const [pendingMode, setPendingMode] = useState<"managed" | "byo" | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const saveIntegration = useSaveIntegration();
  const verifyIntegration = useVerifyIntegration();
  const disconnectIntegration = useDisconnectIntegration();

  const mode = modeDraft ?? savedMode;
  const publicConfig = { ...savedPublic, ...publicDraft };

  // `?focus=` deep-link contract (08-16-SUMMARY.md): scroll the matching
  // card into view and ring-highlight it for 2s, gated on reduced motion.
  useEffect(() => {
    if (searchParams.get("focus") !== channel) return;
    const node = cardRef.current;
    if (!node) return;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    node.classList.add("ring-2", "ring-[#D85A30]/40");
    const timer = setTimeout(() => node.classList.remove("ring-2", "ring-[#D85A30]/40"), FOCUS_RING_MS);
    return () => clearTimeout(timer);
  }, [searchParams, channel]);

  function resetDrafts(): void {
    setModeDraft(null);
    setPublicDraft({});
    setSecretDraft({});
  }

  function requestModeChange(next: "managed" | "byo"): void {
    if (status === "verified") {
      setPendingMode(next);
      return;
    }
    setModeDraft(next);
  }

  const secretDirty = Object.values(secretDraft).some((v) => v !== null);
  const publicDirty = Object.keys(publicDraft).some((k) => publicDraft[k] !== (savedPublic[k] ?? ""));
  const modeDirty = modeDraft !== null && modeDraft !== savedMode;
  const isDirty = modeDirty || publicDirty || secretDirty;

  const required = REQUIRED_FIELDS[channel][mode];
  const isValid =
    required.public.every((key) => (publicConfig[key] ?? "").trim() !== "") &&
    required.secret.every(
      (key) => secretsMeta.some((s) => s.field === key) || Boolean((secretDraft[key] ?? "")?.trim())
    );

  const isSaving = saveIntegration.isPending;
  const isVerifying = verifyIntegration.isPending;
  const displayStatus = isSaving ? "verifying" : status;

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!isDirty || !isValid) return;

    const input: SaveIntegrationInput = { mode, publicConfig: publicDraft };
    const cleanSecrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(secretDraft)) {
      if (value !== null) cleanSecrets[key] = value;
    }
    if (Object.keys(cleanSecrets).length > 0) input.secrets = cleanSecrets;

    try {
      const response = await saveIntegration.mutateAsync({ provider, input });
      if (response.data.status === "failed") {
        toast.error("No pudimos verificar las credenciales");
      } else {
        toast.success("Credenciales verificadas");
        resetDrafts();
        onSaved?.();
      }
    } catch {
      toast.error(NETWORK_ERROR_TOAST);
    }
  }

  async function handleVerify(targetProvider: string): Promise<void> {
    try {
      await verifyIntegration.mutateAsync(targetProvider);
    } catch {
      toast.error(NETWORK_ERROR_TOAST);
    }
  }

  async function handleDisconnect(): Promise<void> {
    setConfirmDisconnect(false);
    try {
      await disconnectIntegration.mutateAsync(provider);
      toast.success("Canal desconectado");
      resetDrafts();
    } catch {
      toast.error(NETWORK_ERROR_TOAST);
    }
  }

  const disabled = isSaving || isVerifying;
  const setPublicField = (key: string, value: string): void =>
    setPublicDraft((d) => ({ ...d, [key]: value }));
  const setSecretField = (key: string, value: string | null): void =>
    setSecretDraft((d) => ({ ...d, [key]: value }));

  const formProps = {
    mode,
    publicConfig,
    setPublicField,
    secretDraft,
    setSecretField,
    secretsMeta,
    disabled,
    integration
  };

  const showGenericSubmit = mode === "byo" || channel === "email";
  const submitLabel = mode === "byo" ? "Guardar y verificar" : copy.primaryCtaManaged;

  return (
    <article
      className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5 transition dark:border-slate-800 dark:bg-slate-900 motion-reduce:transition-none"
      ref={cardRef}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <copy.Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{copy.title}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{copy.description}</p>
          </div>
        </div>
        <IntegrationStatusBadge status={displayStatus} verifiedAt={integration?.verifiedAt} />
      </div>

      {!isAdmin ? (
        <ReadOnlyChannelSummary mode={savedMode} publicConfig={savedPublic} />
      ) : (
        <form className="mt-0" onSubmit={(e) => void handleSubmit(e)}>
          <ChannelModeToggle disabled={disabled} mode={mode} onChange={requestModeChange} />

          {channel === "whatsapp" && (
            <WhatsAppFields {...formProps} onSwitchToByo={() => requestModeChange("byo")} />
          )}
          {channel === "voice" && (
            <PhoneFields
              {...formProps}
              isActivating={isVerifying}
              onActivateVoice={() => void handleVerify(provider)}
              relatedIntegration={relatedIntegration}
            />
          )}
          {channel === "email" && <EmailFields {...formProps} />}

          {isSaving && (
            <p className="mt-2 text-xs text-slate-500">
              Estamos probando las credenciales contra el proveedor. Puede tardar unos segundos.
            </p>
          )}

          {showGenericSubmit && (
            <button
              className="mt-4 rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#c24f29] disabled:opacity-60"
              disabled={disabled || !isDirty || !isValid}
              type="submit"
            >
              {isSaving ? "Verificando…" : submitLabel}
            </button>
          )}

          {status === "failed" && integration?.failureMessage && (
            <ChannelFailureBlock
              at={integration.verifiedAt}
              failureMessage={integration.failureMessage}
              isRetrying={isVerifying}
              onRetry={() => void handleVerify(provider)}
              remedy={copy.remedy}
            />
          )}

          {status !== "not_configured" && (
            <button
              className="mt-4 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              onClick={() => setConfirmDisconnect(true)}
              type="button"
            >
              Desconectar
            </button>
          )}
        </form>
      )}

      {pendingMode && (
        <ConfirmDialog
          body="Vas a reemplazar la conexión actual de este canal. Tendrás que verificar de nuevo antes de poder enviar."
          confirmLabel="Cambiar modo"
          onClose={() => setPendingMode(null)}
          onConfirm={() => {
            setModeDraft(pendingMode);
            setPendingMode(null);
          }}
          title="¿Cambiar el modo de conexión?"
          tone="danger"
        />
      )}

      {confirmDisconnect && (
        <ConfirmDialog
          body={`Dejaremos de enviar por ${copy.title} de inmediato. Las gestiones que lo tenían asignado quedarán detenidas hasta que conectes otro canal.`}
          confirmLabel="Desconectar"
          onClose={() => setConfirmDisconnect(false)}
          onConfirm={() => void handleDisconnect()}
          title={`¿Desconectar ${copy.title}?`}
          tone="danger"
        />
      )}
    </article>
  );
}
