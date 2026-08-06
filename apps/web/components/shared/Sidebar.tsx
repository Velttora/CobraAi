"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../../lib/utils";
import { useEscalations } from "../../hooks/use-conversations";
import { usePendingApprovalsCount } from "../../hooks/use-negotiations";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/portfolios", label: "Portafolios" },
  { href: "/conversations", label: "Conversaciones" },
  { href: "/negotiations", label: "Promesas y acuerdos" },
  { href: "/audit", label: "Auditoría" },
  { href: "/settings", label: "Configuración" }
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: escalationsData } = useEscalations();
  const escalationCount = escalationsData?.data.length ?? 0;
  // Acuerdos esperando aprobación: nada avanza hasta que alguien decida, y el
  // deudor quedó con una respuesta pendiente.
  const pendingApprovals = usePendingApprovalsCount();

  return (
    <aside
      aria-label="Navegación principal"
      className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0A0806]"
    >
      <p className="shrink-0 text-lg font-bold text-[#D85A30]">CobraAI</p>
      <nav aria-label="Secciones" className="mt-8 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const isConversations = item.href === "/conversations";
          const isNegotiations = item.href === "/negotiations";

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-sm transition",
                active
                  ? "bg-[#D85A30]/10 font-medium text-[#D85A30]"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
              href={item.href as Route}
              key={item.href}
            >
              <span>{item.label}</span>
              {isConversations && escalationCount > 0 && (
                <span
                  aria-label={`${escalationCount} escalaciones pendientes`}
                  className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white"
                >
                  {escalationCount > 99 ? "99+" : escalationCount}
                </span>
              )}
              {isNegotiations && pendingApprovals > 0 && (
                <span
                  aria-label={`${pendingApprovals} acuerdos esperando aprobación`}
                  className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white"
                >
                  {pendingApprovals > 99 ? "99+" : pendingApprovals}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 shrink-0 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <OrganizationSwitcher hidePersonal />
        <UserButton afterSignOutUrl="/login" />
      </div>
    </aside>
  );
}
