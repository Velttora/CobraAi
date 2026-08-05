"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IntegrationSetupBanner } from "../../../../components/settings/integrations/IntegrationSetupBanner";
import { IntegrationsTabs } from "../../../../components/settings/integrations/IntegrationsTabs";

export default function IntegrationsLayout({
  children
}: {
  children: React.ReactNode;
}): React.ReactElement {
  // `?focus=` deep-link contract (08-UI-SPEC.md "Routing & Layout"): a link
  // like /settings/integrations?focus=whatsapp scrolls the matching card
  // into view and applies `ring-2 ring-[#D85A30]/40` for 2s. The layout owns
  // and reads the param here to document the contract, but Next.js scopes
  // `useSearchParams()` to the whole route subtree — 08-17/08-18's screens
  // read the same param directly with their own `useSearchParams().get(
  // "focus")` call, no prop drilling or context needed. The highlight
  // animation itself must be gated behind `prefers-reduced-motion` (Tailwind's
  // `motion-reduce:` variant) so it never runs for users who opted out of
  // motion.
  const searchParams = useSearchParams();
  void searchParams.get("focus");

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <Link
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#D85A30]"
          href="/settings"
        >
          <ArrowLeft className="h-4 w-4" /> Configuración
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Integraciones</h1>
        <p className="text-sm text-slate-500">
          Cada mensaje y cada cobro sale a nombre de tu empresa, con tus propias credenciales.
          Aquí conectas los canales y defines cómo recibes el dinero.
        </p>
      </header>

      <IntegrationSetupBanner />

      <IntegrationsTabs />

      {children}
    </section>
  );
}
