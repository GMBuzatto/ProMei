"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Ativar tema claro", Icon: Sun },
  { value: "dark", label: "Ativar tema escuro", Icon: Moon },
] as const;

/**
 * Alternância de tema como controle segmentado (claro | escuro), sobre o `next-themes` já
 * configurado em `src/app/layout.tsx` — nenhum sistema de tema paralelo.
 *
 * Antes da hidratação nenhuma opção aparece marcada: o tema resolvido só é conhecido no
 * cliente, e marcar um palpite causaria troca visível logo depois.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div
      role="group"
      aria-label="Tema"
      className="border-border bg-surface inline-flex items-center gap-1 rounded-lg border p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && resolvedTheme === value;

        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "focus-visible:ring-ring/50 flex h-8 w-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px] motion-reduce:transition-none",
              active
                ? "bg-surface-hover text-foreground"
                : "text-text-tertiary hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
