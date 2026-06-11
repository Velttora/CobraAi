"use client";

import { useMemo, useState } from "react";
import { useCreateContact, useTemplates } from "../../hooks/use-notifications";
import {
  describeManualContactResult
} from "../../lib/contact-feedback";
import {
  channelLabel,
  resolveContactChannel,
  type DebtorContactSnapshot
} from "../../lib/contact-channels";
import { featureFlags, resolveMessageChannel } from "../../lib/feature-flags";

const ALL_CHANNELS = ["email", "sms", "whatsapp", "voice"] as const;
const CHANNELS = ALL_CHANNELS.filter(
  (c) => c !== "sms" || featureFlags.sms
);

export function ContactModal({
  debtId,
  suggestedChannel,
  debtor,
  onClose
}: {
  debtId: string;
  suggestedChannel?: string | null;
  debtor?: DebtorContactSnapshot;
  onClose: () => void;
}): React.ReactElement {
  const templatesQuery = useTemplates();
  const createContact = useCreateContact();

  const { channel: effectiveChannel, isFallback, originalSuggested } = useMemo(
    () =>
      debtor
        ? resolveContactChannel(suggestedChannel, debtor)
        : { channel: null, isFallback: false, originalSuggested: null },
    [suggestedChannel, debtor]
  );

  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>(
    (effectiveChannel as (typeof CHANNELS)[number]) ?? "email"
  );
  const [templateId, setTemplateId] = useState("");
  const [lastFeedback, setLastFeedback] = useState<ReturnType<
    typeof describeManualContactResult
  > | null>(null);

  const templates = useMemo(
    () =>
      (templatesQuery.data?.data.items ?? []).filter(
        (t) => t.channel === channel && t.isApproved
      ),
    [templatesQuery.data, channel]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Contactar ahora</h2>
        <p className="mt-1 text-sm text-slate-500">
          Selecciona canal y template. El motor de compliance validará horario y consentimiento.
        </p>

        <label className="mt-4 block text-sm">
          <span className="text-slate-600 dark:text-slate-400">Canal</span>
          <select
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            onChange={(e) => {
              setChannel(e.target.value as (typeof CHANNELS)[number]);
              setTemplateId("");
            }}
            value={channel}
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {isFallback && originalSuggested && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
              El canal sugerido es <strong>{channelLabel(originalSuggested)}</strong> pero falta
              la información.{" "}
              {effectiveChannel
                ? `Se usará ${channelLabel(effectiveChannel)} como alternativa.`
                : "No hay canales disponibles."}{" "}
              Por favor agrégala en el perfil del deudor.
            </p>
          )}

          {isFallback && !originalSuggested && effectiveChannel && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
              No hay canal sugerido calculado. Se detectó{" "}
              <strong>{channelLabel(effectiveChannel)}</strong> disponible. Re-segmenta
              para actualizar el canal sugerido.
            </p>
          )}

          {isFallback && !effectiveChannel && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
              Este deudor no tiene información de contacto. Agrega email o teléfono en su perfil.
            </p>
          )}
        </label>

        <label className="mt-4 block text-sm">
          <span className="text-slate-600 dark:text-slate-400">Template</span>
          <select
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            onChange={(e) => setTemplateId(e.target.value)}
            value={templateId}
          >
            <option value="">Automático</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {lastFeedback ? (
          <div
            className={`mt-4 rounded-md border px-3 py-2 text-sm ${
              lastFeedback.variant === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                : lastFeedback.variant === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                  : "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            }`}
            role="status"
          >
            <p className="font-medium">{lastFeedback.title}</p>
            <p className="mt-1 text-xs opacity-90">{lastFeedback.description}</p>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29] disabled:opacity-50"
            disabled={createContact.isPending}
            onClick={() => {
              setLastFeedback(null);
              void createContact
                .mutateAsync({
                  debt_id: debtId,
                  channel: resolveMessageChannel(channel),
                  ...(templateId ? { template_id: templateId } : {})
                })
                .then((response) => {
                  const feedback = describeManualContactResult(response.data);
                  if (feedback.variant === "error") {
                    setLastFeedback(feedback);
                    return;
                  }
                  onClose();
                })
                .catch(() => {
                  // El hook ya muestra toast de error de red/servidor.
                });
            }}
            type="button"
          >
            {createContact.isPending ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
