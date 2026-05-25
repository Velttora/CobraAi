"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LOGIN_ROUTE } from "../../lib/routes";

const NAV_LINKS = [
  { href: "#solution", label: "Solución" },
  { href: "#metrics", label: "Resultados" },
  { href: "#packages", label: "Paquetes" },
  { href: "#pricing", label: "Precios" },
  { href: "#compare", label: "Comparativa" }
];

export function LandingNav(): React.ReactElement {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll(): void {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`l-nav${scrolled ? " l-nav-scrolled" : ""}`}>
      <div className="l-container l-nav-inner">
        <Link className="l-display text-xl text-[#f5f0ea] no-underline" href="/">
          Cobra<span className="text-[#D85A30]">AI</span>
        </Link>
        <div className="l-nav-links">
          {NAV_LINKS.map((link) => (
            <a href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </div>
        <Link className="l-btn l-btn-primary" href={LOGIN_ROUTE}>
          Acceder
        </Link>
      </div>
    </nav>
  );
}
