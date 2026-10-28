"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { hasDedicatedTheme, SEGMENT_META } from "../segments";
import type { CompanySegment } from "../types";

/**
 * Tons da marca do nicho, na ordem escuro → claro. São os **mesmos tokens** que os
 * componentes do painel consomem (`bg-primary`, `border-brand`...), então o que aparece
 * aqui é literalmente a cor que a empresa vai ver — não uma amostra pintada à mão.
 */
const SWATCH_CLASSES = [
  "bg-primary-pressed",
  "bg-primary-hover",
  "bg-primary",
  "bg-border-brand",
  "bg-primary-disabled",
  "bg-surface-selected",
];

/**
 * Preview do tema que o segmento escolhido aplica no painel da empresa.
 *
 * O truque é que `[data-niche="..."]` em globals.css é um seletor de atributo comum —
 * vale para **qualquer** elemento, não só o `<html>`. Colocando o atributo neste contêiner,
 * as CSS Variables do nicho passam a valer só dentro dele, e o preview mostra a paleta
 * real sem trocar o tema da tela inteira e sem duplicar nenhum valor de cor.
 *
 * A variante escura mora em `[data-niche="x"].dark`, que exige os dois seletores no
 * **mesmo** elemento — por isso a classe `dark` é aplicada aqui, e não herdada do `<html>`.
 */
export function NicheThemePreview({
  segment,
  className,
}: {
  segment: CompanySegment;
  className?: string;
}) {
  const meta = SEGMENT_META[segment];
  const Icon = meta.icon;
  const { resolvedTheme } = useTheme();

  // O tema resolvido só existe no cliente; sem esta guarda o primeiro render do cliente
  // divergiria do servidor.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <div
      data-niche={meta.niche}
      className={cn(
        "border-border bg-surface-subtle rounded-lg border p-4",
        isDark && "dark",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <div className="bg-primary text-primary-foreground flex h-14 w-14 shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>

        <div className="min-w-0 space-y-1">
          <p className="text-foreground text-sm font-semibold">Preview do tema</p>
          <p className="text-text-secondary text-sm leading-relaxed">
            {hasDedicatedTheme(segment)
              ? "As cores principais deste nicho serão aplicadas no painel da empresa."
              : "Este segmento ainda não tem paleta própria. O painel usa a cor padrão ProMei."}
          </p>
        </div>
      </div>

      {/*
       * Amostra decorativa: a informação já está no texto acima, então não há nada aqui
       * para um leitor de tela anunciar.
       */}
      <div aria-hidden="true" className="mt-4 flex h-6 overflow-hidden rounded-md">
        {SWATCH_CLASSES.map((swatch) => (
          <span key={swatch} className={cn("flex-1", swatch)} />
        ))}
      </div>
    </div>
  );
}
