"use client";

import { ArrowUpFromLine, LayoutDashboard, Package, Warehouse } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import type { NicheKey } from "@/lib/niches";
import { cn } from "@/lib/utils";

/**
 * Preview do tema aplicado (aceite desta entrega): um recorte do painel real pintado com a
 * paleta do nicho escolhido.
 *
 * O que faz isto ser preview de verdade, e não uma amostra de cores: cada peça aqui usa os
 * **mesmos tokens semânticos** que o painel usa (`bg-primary`, `bg-nav-item-active`,
 * `text-text-brand`...). Não há hex nenhum neste arquivo — o que aparece na miniatura é
 * literalmente o que a empresa vai ver na tela cheia.
 *
 * O escopo funciona porque `[data-niche="..."]` em globals.css é um seletor de atributo
 * comum, válido em qualquer elemento: com o atributo neste contêiner, as CSS Variables do
 * nicho valem só aqui dentro, sem trocar o tema da página.
 *
 * A variante escura mora em `[data-niche="x"].dark`, que exige os dois seletores no **mesmo**
 * elemento — por isso a classe `dark` é aplicada aqui, e não herdada do `<html>`. Sem isso o
 * preview misturaria fundo escuro com a marca da variante clara.
 */
export function ThemePreview({ niche, className }: { niche: NicheKey; className?: string }) {
  const { resolvedTheme } = useTheme();

  // O tema resolvido só existe no cliente; sem esta guarda o primeiro render do cliente
  // divergiria do servidor.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <div
      data-niche={niche}
      // Decorativo: tudo o que ele comunica já está dito em texto no cartão que o envolve.
      aria-hidden="true"
      className={cn(
        "border-border bg-background overflow-hidden rounded-lg border",
        isDark && "dark",
        className,
      )}
    >
      <div className="flex">
        <MiniSidebar />

        <div className="min-w-0 flex-1 space-y-3 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-foreground text-sm font-semibold">Dashboard</span>
            <span className="bg-primary text-primary-foreground rounded-md px-2 py-1 text-[10px] font-medium">
              Registrar saída
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Saídas hoje" value="12" />
            <MiniStat label="Itens" value="248" />
            <MiniStat label="Em alerta" value="3" />
          </div>

          <div className="border-border bg-surface rounded-md border p-3">
            <p className="text-text-secondary text-[10px]">Movimentações recentes</p>

            <div className="mt-2 space-y-2">
              <MiniRow name="Brigadeiro tradicional" quantity="-25" highlighted />
              <MiniRow name="Embalagem kraft P" quantity="+200" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniSidebar() {
  return (
    <div className="bg-nav-background border-nav-border w-28 shrink-0 space-y-1 border-r p-2">
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span className="bg-primary text-primary-foreground flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold">
          P
        </span>
        <span className="text-foreground text-[10px] font-semibold">ProMei</span>
      </div>

      <MiniNavItem icon={LayoutDashboard} label="Dashboard" active />
      <MiniNavItem icon={Package} label="Itens" />
      <MiniNavItem icon={Warehouse} label="Estoque" />
      <MiniNavItem icon={ArrowUpFromLine} label="Saídas" />
    </div>
  );
}

function MiniNavItem({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof Package;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px]",
        active ? "bg-nav-item-active text-nav-text-active" : "text-nav-text",
      )}
    >
      <Icon className={cn("h-3 w-3", active ? "text-nav-icon-active" : "text-nav-icon")} />
      {label}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-surface rounded-md border p-2">
      <p className="text-text-secondary text-[9px]">{label}</p>
      <p className="text-foreground text-sm font-bold">{value}</p>
    </div>
  );
}

function MiniRow({
  name,
  quantity,
  highlighted = false,
}: {
  name: string;
  quantity: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded px-2 py-1",
        highlighted && "bg-surface-selected",
      )}
    >
      <span
        className={cn("truncate text-[10px]", highlighted ? "text-text-brand" : "text-foreground")}
      >
        {name}
      </span>
      <span className="text-text-secondary text-[10px] tabular-nums">{quantity}</span>
    </div>
  );
}
