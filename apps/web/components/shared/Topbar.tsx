"use client";

import { ThemeToggle } from "./ThemeToggle";

export function Topbar({ title }: { title?: string }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-[#0A0806]">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {title ?? "Plataforma de cobranza"}
      </span>
      <ThemeToggle />
    </header>
  );
}
