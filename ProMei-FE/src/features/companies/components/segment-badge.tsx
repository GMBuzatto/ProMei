"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SEGMENT_META } from "../segments";
import type { CompanySegment } from "../types";

/**
 * Selo do segmento com o ícone na cor do nicho.
 *
 * Mesmo mecanismo do `<NicheThemePreview>`: `data-niche` no contêiner faz as variáveis do
 * nicho valerem só aqui dentro, então cada linha da tabela mostra a cor real daquela
 * empresa sem que nenhuma cor seja escrita no componente.
 */
export function SegmentBadge({
  segment,
  className,
}: {
  segment: CompanySegment;
  className?: string;
}) {
  const meta = SEGMENT_META[segment];
  const Icon = meta.icon;
  const { resolvedTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <span
      data-niche={meta.niche}
      className={cn(
        "bg-surface-selected inline-flex items-center gap-2 rounded-md py-1 pr-3 pl-1.5 text-sm",
        isDark && "dark",
        className,
      )}
    >
      <span className="bg-primary text-primary-foreground flex h-6 w-6 items-center justify-center rounded">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="text-foreground font-medium">{meta.label}</span>
    </span>
  );
}
