"use client";

import { useMemo, useState } from "react";
import { useCreateContact, useTemplates } from "../../hooks/use-notifications";

const CHANNELS = ["email", "sms", "whatsapp", "voice"] as const;

export function ContactModal({
  debtId,
  onClose
}: {
  debtId: string;
  onClose: () => void;
}): React.ReactElement {
  const templatesQuery = useTemplates();
  const createContact = useCreateContact();
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("email");
  const [templateId, setTemplateId] = useState("");

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
              void createContact
                .mutateAsync({
                  debt_id: debtId,
                  channel,
                  ...(templateId ? { template_id: templateId } : {})
                })
                .then(() => onClose());
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
