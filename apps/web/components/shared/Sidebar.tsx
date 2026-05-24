"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../../lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/portfolios", label: "Portafolios" },
  { href: "/audit", label: "Auditoría" },
  { href: "/settings", label: "Configuración" }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#0A0806]">
      <p className="text-lg font-bold text-[#D85A30]">CobraAI</p>
      <nav className="mt-8 flex flex-col gap-1">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              className={cn(
                "rounded-md px-3 py-2 text-sm transition",
                active
                  ? "bg-[#D85A30]/10 font-medium text-[#D85A30]"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
              href={item.href as Route}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <OrganizationSwitcher hidePersonal />
        <UserButton afterSignOutUrl="/login" />
      </div>
    </aside>
  );
}
