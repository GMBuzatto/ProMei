"use client";

import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="bg-nav-background border-nav-border sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b px-4">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir navegação"
        className="text-text-secondary hover:bg-surface-hover hover:text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Sem título aqui: ele era fixo em "Dashboard" e aparecia igual em Planos, Empresas e
          nas demais telas. Cada página já traz o próprio `<h1>`, que é o título de verdade —
          um segundo, errado e acima dele, só contradizia a tela. */}
      <div className="flex-1" />

      <ThemeToggle />
    </header>
  );
}
