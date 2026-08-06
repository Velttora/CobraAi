"use client";

import { Loader2, MessageCircle } from "lucide-react";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useEmbeddedSignup, useVerifyIntegration } from "../../../hooks/use-integrations";
import { useTenant } from "../../../hooks/use-tenant";
import type { IntegrationView } from "../../../lib/types";
import { useEmbeddedSignupPolling } from "./use-embedded-signup-polling";

const SDK_LOAD_TIMEOUT_MS = 8000;
const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";

/** Origins Meta actually serves the Embedded Signup popup from. */
const META_ORIGINS = new Set([
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://business.facebook.com",
  "https://facebook.com"
]);

/**
 * Exact-match the postMessage origin against origins Meta owns.
 *
 * A suffix check like `origin.endsWith("facebook.com")` looks equivalent and is
 * not: `https://evil-facebook.com` satisfies it. That gap is enough for a page
 * an authenticated admin is lured to, to forge a `FINISH` handoff and repoint
 * the tenant's WhatsApp channel at a `wabaId`/`phoneNumberId` the attacker
 * controls — every subsequent message to that tenant's debtors would leave
 * through their number.
 */
function isMetaOrigin(origin: string): boolean {
  return META_ORIGINS.has(origin);
}
const PROGRESS_STEPS = [
  "Creando tu cuenta en Twilio",
  "Conectando tu número de WhatsApp",
  "Verificando el envío"
];

interface FacebookSdk {
  init: (params: { appId: string; version: string; xfbml: boolean; cookie: boolean }) => void;
  login: (
    callback: (response: unknown) => void,
    params: { config_id: string; response_type: string; override_default_response_type: boolean }
  ) => void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
  }
}

type SignupState = "sdk_loading" | "sdk_unavailable" | "ready" | "popup_open" | "popup_cancelled" | "exchanging";

interface WaEmbeddedSignupMessage {
  type?: string;
  event?: "FINISH" | "CANCEL" | "ERROR";
  data?: {
    waba_id?: string;
    phone_number_id?: string;
    phone_number?: string;
    business_name?: string;
  };
}

export interface EmbeddedSignupButtonProps {
  integration?: IntegrationView;
  onSwitchToByo: () => void;
}

/**
 * D-25 Meta Embedded Signup. Gated on both `NEXT_PUBLIC_FACEBOOK_APP_ID` and
 * `NEXT_PUBLIC_FACEBOOK_CONFIG_ID` (08-02-SUMMARY.md: no Meta app exists
 * yet) — when either is absent, this renders the `sdk_unavailable` fallback
 * immediately, without ever attempting to load `connect.facebook.net`
 * (T-08-17d). The SDK script is loaded by this component only, with
 * `next/script strategy="lazyOnload"`, never from the root layout (T-08-08).
 */
export function EmbeddedSignupButton({
  integration,
  onSwitchToByo
}: EmbeddedSignupButtonProps): React.ReactElement {
  // Read at call time (not as a module-level constant) so a fresh mount
  // always reflects the current env — this is also what makes the gate
  // testable with `vi.stubEnv` without a `vi.resetModules()` dance.
  const facebookAppId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const facebookConfigId = process.env.NEXT_PUBLIC_FACEBOOK_CONFIG_ID;
  const envConfigured = Boolean(facebookAppId && facebookConfigId);
  const [state, setState] = useState<SignupState>(envConfigured ? "sdk_loading" : "sdk_unavailable");
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tenantQuery = useTenant();
  const embeddedSignup = useEmbeddedSignup();
  const verifyIntegration = useVerifyIntegration();

  const isPendingMeta = integration?.status === "pending_meta";
  const { timedOut } = useEmbeddedSignupPolling(isPendingMeta, () => {
    void verifyIntegration.mutateAsync("twilio_whatsapp");
  });

  useEffect(() => {
    if (!envConfigured) return;
    loadTimeoutRef.current = setTimeout(() => setState("sdk_unavailable"), SDK_LOAD_TIMEOUT_MS);
    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, [envConfigured]);

  // T-08-17b: only act on messages that look like Meta's WhatsApp Embedded
  // Signup handshake, from an origin Meta actually owns — a forged postMessage
  // from any other origin/shape is ignored.
  useEffect(() => {
    function handleMessage(event: MessageEvent<WaEmbeddedSignupMessage>): void {
      if (!isMetaOrigin(event.origin)) return;
      const payload = event.data;
      if (!payload || payload.type !== "WA_EMBEDDED_SIGNUP") return;

      if (payload.event === "CANCEL") {
        setState("popup_cancelled");
        return;
      }
      if (payload.event === "ERROR") {
        toast.error("No se pudo conectar con WhatsApp. Intenta de nuevo.");
        setState("ready");
        return;
      }
      if (payload.event === "FINISH" && payload.data?.waba_id && payload.data.phone_number_id) {
        void handleFinish(payload.data);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [tenantQuery.data?.data?.name]);

  async function handleFinish(data: NonNullable<WaEmbeddedSignupMessage["data"]>): Promise<void> {
    setState("exchanging");
    // Held only in local variables for the duration of this call — never in
    // component state, storage, or a URL (T-08-17c).
    const businessName = data.business_name ?? tenantQuery.data?.data?.name ?? "";
    try {
      await embeddedSignup.mutateAsync({
        wabaId: data.waba_id ?? "",
        phoneNumberId: data.phone_number_id ?? "",
        phoneNumberE164: data.phone_number ?? "",
        businessName
      });
    } catch {
      toast.error("No se pudo conectar con WhatsApp. Intenta de nuevo.");
    } finally {
      setState("ready");
    }
  }

  function handleClick(): void {
    if (!window.FB) return;
    setState("popup_open");
    window.FB.login(() => undefined, {
      config_id: facebookConfigId ?? "",
      response_type: "code",
      override_default_response_type: true
    });
  }

  if (isPendingMeta) {
    return (
      <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
        <p className="text-slate-700 dark:text-slate-300">
          Meta todavía está revisando tu número. Suele tardar unos minutos. Te avisamos aquí cuando quede listo.
        </p>
        {timedOut && (
          <button
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            onClick={() => void verifyIntegration.mutateAsync("twilio_whatsapp")}
            type="button"
          >
            Actualizar estado
          </button>
        )}
      </div>
    );
  }

  if (!envConfigured || state === "sdk_unavailable") {
    return (
      <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/50">
        <p className="text-slate-700 dark:text-slate-300">
          No pudimos cargar el conector de Meta. Revisa si una extensión del navegador lo está bloqueando, o
          conecta tus credenciales manualmente.
        </p>
        <button className="text-sm text-[#D85A30] hover:underline" onClick={onSwitchToByo} type="button">
          Conectar con mis propias credenciales
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {envConfigured && (
        <Script
          onError={() => setState("sdk_unavailable")}
          onLoad={() => {
            if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
            window.FB?.init({ appId: facebookAppId ?? "", version: "v21.0", xfbml: false, cookie: true });
            setState("ready");
          }}
          src={SDK_SRC}
          strategy="lazyOnload"
        />
      )}

      {state === "exchanging" ? (
        <ol className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
          {PROGRESS_STEPS.map((step) => (
            <li className="flex items-center gap-2" key={step}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {step}
            </li>
          ))}
        </ol>
      ) : (
        <>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            disabled={state === "sdk_loading" || state === "popup_open"}
            onClick={handleClick}
            type="button"
          >
            {state === "sdk_loading" && <Loader2 className="h-4 w-4 animate-spin" />}
            {state === "sdk_loading" && "Cargando…"}
            {state === "popup_open" && "Continúa en la ventana de Meta…"}
            {(state === "ready" || state === "popup_cancelled") && (
              <>
                <MessageCircle aria-hidden="true" className="h-4 w-4 text-[#25D366]" />
                Conectar con WhatsApp
              </>
            )}
          </button>
          {state === "popup_open" && (
            <button
              className="ml-2 text-xs text-slate-500 hover:underline"
              onClick={handleClick}
              type="button"
            >
              ¿No se abrió? Reintentar
            </button>
          )}
          {state === "popup_cancelled" && (
            <p className="text-xs text-slate-500">
              Cancelaste la conexión. Puedes intentarlo de nuevo cuando quieras.
            </p>
          )}
        </>
      )}
    </div>
  );
}
