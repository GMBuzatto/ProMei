"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Claro", icon: Sun, hint: "Fundo claro o tempo todo." },
  { value: "dark", label: "Escuro", icon: Moon, hint: "Fundo escuro o tempo todo." },
  { value: "system", label: "Sistema", icon: Monitor, hint: "Acompanha o aparelho." },
] as const;

/**
 * Claro, escuro ou "sistema" — sobre o `next-themes` já configurado no layout, sem nenhum
 * mecanismo de tema paralelo.
 *
 * Aqui a opção **"sistema"** aparece, diferente do botão do cabeçalho: no atalho do topo ela
 * seria um terceiro estado difícil de ler num ícone; numa tela de configurações ela é o padrão
 * que a maioria dos apps oferece e o único jeito de voltar atrás depois de escolher à mão.
 *
 * Claro/escuro e nicho são dimensões **independentes** (docs/styles/temas/README.md): trocar
 * uma não mexe na outra.
 */
export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Antes da hidratação nada aparece marcado: o tema só é conhecido no cliente, e marcar um
  // palpite causaria troca visível logo depois.
  useEffect(() => setMounted(true), []);

  return (
    <Card>
      <CardContent className="space-y-4">
        <header className="space-y-1">
          <h2 className="text-foreground text-lg font-semibold">Aparência</h2>
          <p className="text-text-secondary text-sm">
            Vale só para este navegador: é preferência de quem usa, não da empresa.
          </p>
        </header>

        <div role="radiogroup" aria-label="Tema" className="grid gap-3 sm:grid-cols-3">
          {OPTIONS.map(({ value, label, icon: Icon, hint }) => {
            const selected = mounted && theme === value;

            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  "focus-visible:border-input-border-focus focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                  "motion-reduce:transition-none",
                  selected
                    ? "border-border-brand bg-surface-selected"
                    : "border-border hover:bg-surface-hover",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    selected ? "text-text-brand" : "text-text-tertiary",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="text-foreground block text-sm font-medium">{label}</span>
                  <span className="text-text-secondary block text-xs leading-snug">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
