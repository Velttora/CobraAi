"use client";

import { Cable, Check, ChevronDown, ChevronUp, Copy, Loader2, Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  ALL_OUTBOUND_EVENTS,
  ERP_TYPE_LABELS,
  OUTBOUND_EVENT_LABELS,
  useCreateIntegration,
  useDeleteIntegration,
  useIntegrations,
  useTestIntegration,
  type CreateIntegrationPayload,
  type ErpIntegration,
  type ErpType,
  type OutboundEvent
} from "../../hooks/use-integrations";

// ── Helpers ───────────────────────────────────────────────────────────────────

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copiado`),
    () => toast.error("No se pudo copiar al portapapeles")
  );
}

function inboundUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/erp/inbound`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Sin eventos aún";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Hace menos de 1 min";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  return `Hace ${Math.floor(hrs / 24)} d`;
}

// ── Inbound schema docs ────────────────────────────────────────────────────────

const SCHEMA_EXAMPLE = JSON.stringify(
  {
    portfolio_id: "uuid-del-portafolio",
    debts: [
      {
        external_id: "FAC-2025-001",
        debtor_name: "Juan García López",
        debtor_document_type: "CC",
        debtor_document: "1234567890",
        debtor_phone: "+573001234567",
        debtor_email: "juan@empresa.com",
        amount_outstanding: 1500000,
        currency: "COP",
        due_date: "2025-08-01",
        description: "Factura agosto 2025"
      }
    ]
  },
  null,
  2
);

function SchemaDocsPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="flex items-center gap-2">
          <Cable className="h-4 w-4 text-slate-400" />
          Esquema del payload inbound (ERP → CobraAI)
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {open ? (
        <div className="border-t border-slate-200 px-4 pb-4 dark:border-slate-800">
          <p className="mt-3 text-xs text-slate-500">
            Tu ERP debe hacer <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">POST /api/erp/inbound</code> con el header{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">X-Api-Key: tu-api-key</code> y este cuerpo JSON:
          </p>
          <div className="relative mt-3">
            <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-300 dark:bg-black">
              {SCHEMA_EXAMPLE}
            </pre>
            <button
              className="absolute right-2 top-2 rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              onClick={() => copyToClipboard(SCHEMA_EXAMPLE, "Esquema")}
              title="Copiar"
              type="button"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="mt-4 text-xs font-medium text-slate-600 dark:text-slate-400">Evento outbound (CobraAI → ERP)</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-300 dark:bg-black">
            {JSON.stringify(
              {
                event: "debt.paid",
                timestamp: "2025-06-09T10:00:00Z",
                data: {
                  debt_id: "uuid",
                  external_id: "FAC-2025-001",
                  amount: 1500000,
                  currency: "COP"
                }
              },
              null,
              2
            )}
          </pre>

          <p className="mt-3 text-xs text-slate-500">
            CobraAI firma cada evento outbound con el header{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">X-Cobra-Signature: hmac-sha256</code>{" "}
            para que puedas verificar la autenticidad en tu ERP.
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ── Integration card ──────────────────────────────────────────────────────────

function IntegrationCard({ integration }: { integration: ErpIntegration }) {
  const deleteIntegration = useDeleteIntegration();
  const testIntegration = useTestIntegration();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    try {
      await deleteIntegration.mutateAsync(integration.id);
      toast.success("Integración eliminada");
    } catch {
      toast.error("No se pudo eliminar la integración");
    }
  }

  async function handleTest() {
    if (!integration.outbound_webhook_url) {
      toast.error("Configura un webhook outbound para probar la conexión");
      return;
    }
    try {
      const res = await testIntegration.mutateAsync(integration.id);
      if (res.delivered) {
        toast.success("Evento de prueba enviado correctamente");
      } else {
        toast.error("El webhook no respondió con 2xx");
      }
    } catch {
      toast.error("Error al enviar el evento de prueba");
    }
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              integration.status === "active" ? "bg-emerald-500" : "bg-slate-300"
            }`}
          />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {integration.name}
            </p>
            <p className="text-xs text-slate-500">
              {ERP_TYPE_LABELS[integration.erp_type]}
              {" · "}
              {formatRelativeTime(integration.last_event_at)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {integration.outbound_webhook_url ? (
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              disabled={testIntegration.isPending}
              onClick={() => void handleTest()}
              type="button"
            >
              {testIntegration.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              Probar
            </button>
          ) : null}

          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500">¿Confirmar?</span>
              <button
                className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                disabled={deleteIntegration.isPending}
                onClick={() => void handleDelete()}
                type="button"
              >
                {deleteIntegration.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Sí, eliminar"
                )}
              </button>
              <button
                className="rounded-md px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                onClick={() => setConfirmDelete(false)}
                type="button"
              >
                No
              </button>
            </div>
          ) : (
            <button
              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
              onClick={() => setConfirmDelete(true)}
              title="Eliminar integración"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Credentials */}
      <dl className="mt-4 space-y-2.5 text-xs">
        <CredentialRow
          label="URL inbound"
          value={inboundUrl()}
          onCopy={() => copyToClipboard(inboundUrl(), "URL inbound")}
        />
        <CredentialRow
          label="API Key"
          value={integration.api_key_preview}
          onCopy={() =>
            toast.error(
              "La API key completa solo se muestra una vez al crearla"
            )
          }
          masked
        />
        {integration.outbound_webhook_url ? (
          <CredentialRow
            label="Webhook outbound"
            value={integration.outbound_webhook_url}
            onCopy={() =>
              copyToClipboard(integration.outbound_webhook_url!, "Webhook outbound")
            }
          />
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Webhook outbound</span>
            <span className="text-slate-400">No configurado</span>
          </div>
        )}
      </dl>

      {/* Events */}
      {integration.events.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {integration.events.map((ev) => (
            <span
              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              key={ev}
            >
              {OUTBOUND_EVENT_LABELS[ev]}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function CredentialRow({
  label,
  value,
  onCopy,
  masked = false
}: {
  label: string;
  value: string;
  onCopy: () => void;
  masked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-slate-500">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={`truncate font-mono ${
            masked ? "text-slate-400" : "text-slate-700 dark:text-slate-300"
          }`}
        >
          {value}
        </span>
        <button
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          onClick={onCopy}
          title={masked ? "La API key completa solo se muestra al crearla" : `Copiar ${label}`}
          type="button"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

const DEFAULT_FORM: CreateIntegrationPayload = {
  name: "",
  erp_type: "custom",
  outbound_webhook_url: "",
  events: ["debt.paid", "debt.promise_to_pay"]
};

function CreateIntegrationModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: (apiKey: string, name: string) => void;
}) {
  const [form, setForm] = useState<CreateIntegrationPayload>(DEFAULT_FORM);
  const createIntegration = useCreateIntegration();

  function toggleEvent(ev: OutboundEvent) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev)
        ? f.events.filter((e) => e !== ev)
        : [...f.events, ev]
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload: CreateIntegrationPayload = {
        ...form,
        outbound_webhook_url: form.outbound_webhook_url?.trim() || undefined
      };
      const res = await createIntegration.mutateAsync(payload);
      onCreated(res.data.api_key, res.data.name);
    } catch {
      toast.error("No se pudo crear la integración");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Nueva integración ERP
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          La API key completa se muestra solo una vez al crear.
        </p>

        <div className="mt-5 space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Nombre de la integración
            </span>
            <input
              autoFocus
              className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D85A30] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="SAP Producción"
              required
              value={form.name}
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Sistema ERP
            </span>
            <select
              className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D85A30] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              onChange={(e) =>
                setForm((f) => ({ ...f, erp_type: e.target.value as ErpType }))
              }
              value={form.erp_type}
            >
              {(Object.keys(ERP_TYPE_LABELS) as ErpType[]).map((t) => (
                <option key={t} value={t}>
                  {ERP_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              URL webhook outbound{" "}
              <span className="font-normal text-slate-400">(opcional)</span>
            </span>
            <input
              className="mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D85A30] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              onChange={(e) =>
                setForm((f) => ({ ...f, outbound_webhook_url: e.target.value }))
              }
              placeholder="https://erp.empresa.com/webhooks/cobra"
              type="url"
              value={form.outbound_webhook_url ?? ""}
            />
            <span className="mt-1 text-xs text-slate-400">
              CobraAI enviará eventos a esta URL cuando haya cambios en deudas.
            </span>
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Eventos a notificar
            </legend>
            <div className="mt-2 space-y-2">
              {ALL_OUTBOUND_EVENTS.map((ev) => {
                const checked = form.events.includes(ev);
                return (
                  <label
                    className="flex cursor-pointer items-center gap-2.5 text-sm"
                    key={ev}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        checked
                          ? "border-[#D85A30] bg-[#D85A30]"
                          : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900"
                      }`}
                      onClick={() => toggleEvent(ev)}
                    >
                      {checked ? (
                        <Check className="h-3 w-3 text-white" />
                      ) : null}
                    </span>
                    <input
                      checked={checked}
                      className="sr-only"
                      onChange={() => toggleEvent(ev)}
                      type="checkbox"
                    />
                    <span className="text-slate-700 dark:text-slate-300">
                      {OUTBOUND_EVENT_LABELS[ev]}
                    </span>
                    <code className="ml-auto text-xs text-slate-400">{ev}</code>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            className="rounded-md px-4 py-2 text-sm text-slate-600 hover:text-slate-800 dark:text-slate-400"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-md bg-[#D85A30] px-4 py-2 text-sm font-medium text-white hover:bg-[#c24f29] disabled:opacity-50"
            disabled={createIntegration.isPending || !form.name.trim()}
            type="submit"
          >
            {createIntegration.isPending ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Creando…
              </span>
            ) : (
              "Crear integración"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── API key reveal modal ──────────────────────────────────────────────────────

function ApiKeyRevealModal({
  apiKey,
  integrationName,
  onClose
}: {
  apiKey: string;
  integrationName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-emerald-200 bg-white p-6 shadow-xl dark:border-emerald-900/40 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30">
            <Check className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Integración creada: {integrationName}
            </h2>
            <p className="text-xs text-slate-500">
              Guarda esta API key — no la mostraremos de nuevo.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Copia y guarda esta clave en tu ERP ahora mismo. Por seguridad, no se puede recuperar después.
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
          <code className="flex-1 truncate text-xs font-mono text-slate-800 dark:text-slate-200">
            {apiKey}
          </code>
          <button
            className={`shrink-0 rounded p-1.5 transition-colors ${
              copied
                ? "text-emerald-600"
                : "text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800"
            }`}
            onClick={handleCopy}
            type="button"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="mt-5 space-y-2 text-xs text-slate-500">
          <p>
            <span className="font-medium text-slate-700 dark:text-slate-300">URL inbound:</span>{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
              {inboundUrl()}
            </code>
          </p>
          <p>
            Envía el header{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
              X-Api-Key: {apiKey.slice(0, 18)}…
            </code>{" "}
            en cada request desde tu ERP.
          </p>
        </div>

        <button
          className="mt-6 w-full rounded-md bg-[#D85A30] py-2 text-sm font-medium text-white hover:bg-[#c24f29]"
          onClick={onClose}
          type="button"
        >
          Entendido, ya la guardé
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ErpIntegrations() {
  const { data, isLoading, error } = useIntegrations();
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<{
    key: string;
    name: string;
  } | null>(null);

  const integrations = data?.data.items ?? [];

  function handleCreated(apiKey: string, name: string) {
    setShowCreate(false);
    setCreatedKey({ key: apiKey, name });
  }

  return (
    <>
      <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#D85A30]/10 text-[#D85A30]">
              <Cable className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Integraciones ERP
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Conecta SAP, Siigo, World Office u otro sistema para sincronizar
                cartera en tiempo real.
              </p>
            </div>
          </div>
          <button
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#D85A30] px-3 py-2 text-sm font-medium text-white hover:bg-[#c24f29]"
            onClick={() => setShowCreate(true)}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Nueva
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
                  key={i}
                />
              ))}
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              No se pudieron cargar las integraciones. Verifica que el gateway
              esté activo.
            </p>
          ) : integrations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-6 py-8 text-center dark:border-slate-700">
              <Cable className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                Sin integraciones configuradas
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Crea una integración para que tu ERP envíe cartera a CobraAI
                automáticamente.
              </p>
            </div>
          ) : (
            integrations.map((integration) => (
              <IntegrationCard key={integration.id} integration={integration} />
            ))
          )}
        </div>

        <div className="mt-4">
          <SchemaDocsPanel />
        </div>
      </article>

      {showCreate ? (
        <CreateIntegrationModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      ) : null}

      {createdKey ? (
        <ApiKeyRevealModal
          apiKey={createdKey.key}
          integrationName={createdKey.name}
          onClose={() => setCreatedKey(null)}
        />
      ) : null}
    </>
  );
}
