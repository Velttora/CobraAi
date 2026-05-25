import Link from "next/link";
import type { Route } from "next";
import { LOGIN_ROUTE } from "../../lib/routes";

const FOOTER_LINKS = [
  { href: "#solution", label: "Solución", external: false },
  { href: "#metrics", label: "Resultados", external: false },
  { href: "#packages", label: "Paquetes", external: false },
  { href: "#compare", label: "Comparativa", external: false },
  { href: LOGIN_ROUTE, label: "Acceder", external: true }
] as const;

export function LandingFooter(): React.ReactElement {
  return (
    <footer className="l-footer l-container">
      <div className="l-footer-grid">
        <div>
          <p className="l-display text-xl">
            Cobra<span className="text-[#D85A30]">AI</span>
          </p>
          <p className="mt-2 max-w-xs">
            Plataforma de cobranza inteligente para equipos de cartera en LATAM.
          </p>
        </div>
        <nav aria-label="Enlaces del pie" className="l-footer-links">
          {FOOTER_LINKS.map((link) =>
            link.external ? (
              <Link href={link.href as Route} key={link.href}>
                {link.label}
              </Link>
            ) : (
              <a href={link.href} key={link.href}>
                {link.label}
              </a>
            )
          )}
        </nav>
      </div>
      <p className="mt-8 text-center text-xs leading-relaxed">
        © 2026 CobraAI. Todos los derechos reservados.{" "}
        Desarrollada por{" "}
        <a
          className="l-footer-credit-link"
          href="https://velttora.com"
          rel="noopener noreferrer"
          target="_blank"
        >
          Velttora LLC
        </a>
        .
      </p>
    </footer>
  );
}
