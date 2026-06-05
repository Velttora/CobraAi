import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingPage } from "../components/landing/LandingPage";
import { resolveServerLandingPath } from "../lib/server/resolve-landing-path";

export const metadata: Metadata = {
  title: "CobraAI — Cobranza inteligente para LATAM",
  description:
    "Plataforma SaaS de cobranza con score IA, workflows omnicanal, paquetes pre-configurados y compliance local para equipos de cartera en Colombia y México.",
  openGraph: {
    title: "CobraAI — Cobranza inteligente para LATAM",
    description:
      "Recupera más con automatización, WhatsApp, email y voz IA. Paquetes de reglas listos para aplicar.",
    locale: "es_CO",
    type: "website"
  }
};

export default async function HomePage(): Promise<React.ReactElement> {
  const { userId, orgId } = await auth();

  if (userId && orgId) {
    redirect(await resolveServerLandingPath());
  }

  if (userId && !orgId) {
    redirect("/onboarding");
  }

  return <LandingPage />;
}
