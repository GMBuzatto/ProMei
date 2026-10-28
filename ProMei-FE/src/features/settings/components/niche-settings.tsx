"use client";

import { Check, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNiche } from "@/components/niche-provider";
import { SEGMENT_META, hasDedicatedTheme, nicheForSegment } from "@/features/companies/segments";
import { COMPANY_SEGMENTS, type CompanySegment } from "@/features/companies/types";
import { DEFAULT_NICHE, type NicheKey } from "@/lib/niches";
import { cn } from "@/lib/utils";
import { ThemePreview } from "./theme-preview";

/**
 * Tema do nicho: a paleta de marca muda por segmento da empresa, em runtime, sem rebuild
 * (docs/styles/temas/README.md).
 *
 * A escolha é feita pelo **segmento**, não pela chave do tema, porque é assim que a empresa
 * pensa — e é o mesmo campo que o cadastro da empresa guarda na API (`CompanySegment`). O
 * mapa segmento → nicho já existe em `features/companies/segments`, então as duas telas não
 * podem divergir.
 *
 * O preview aplica antes de aplicar: escolher um segmento repinta só a miniatura; o painel só
 * muda quando alguém confirma. Trocar o tema da tela inteira a cada clique tornaria impossível
 * comparar duas opções.
 */
export function NicheSettings() {
  const { niche, setNiche } = useNiche();

  // Qual segmento a tela mostra como escolhido: o primeiro que leva ao nicho ativo. Vários
  // segmentos caem no tema padrão, então este palpite é aproximado de propósito — o dado
  // oficial é o segmento no cadastro da empresa, que a API ainda não expõe ao tenant.
  const [segment, setSegment] = useState<CompanySegment>(
    () => COMPANY_SEGMENTS.find((option) => nicheForSegment(option) === niche) ?? "OTHER",
  );

  const previewNiche: NicheKey = nicheForSegment(segment);
  const applied = previewNiche === niche;

  return (
    <Card>
      <CardContent className="space-y-6">
        <header className="space-y-1">
          <h2 className="text-foreground text-lg font-semibold">Tema do nicho</h2>
          <p className="text-text-secondary text-sm">
            A cor de marca do painel acompanha o segmento da empresa. Escolha para ver como fica; o
            painel só muda quando você aplicar.
          </p>
        </header>

        <fieldset className="space-y-3">
          <legend className="text-foreground mb-2 text-sm font-medium">Segmento</legend>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {COMPANY_SEGMENTS.map((option) => {
              const meta = SEGMENT_META[option];
              const Icon = meta.icon;
              const selected = option === segment;

              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSegment(option)}
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
                    <span className="text-foreground block text-sm font-medium">{meta.label}</span>
                    <span className="text-text-secondary block text-xs leading-snug">
                      {meta.hint}
                    </span>
                    {/* Quem escolhe está escolhendo cor: dizer qual paleta cada segmento traz
                        evita a surpresa de marcar "Varejo" e ver o painel continuar azul. */}
                    <span className="text-text-tertiary mt-1 block text-xs">
                      {hasDedicatedTheme(option)
                        ? "Paleta própria deste nicho."
                        : "Paleta padrão do painel."}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-foreground text-sm font-medium">Preview do tema</h3>
            <p className="text-text-tertiary text-xs">
              {applied ? "É o tema aplicado agora." : "Ainda não aplicado."}
            </p>
          </div>

          <ThemePreview niche={previewNiche} />

          <p className="text-text-tertiary text-xs">
            {hasDedicatedTheme(segment)
              ? "Cores semânticas (sucesso, alerta, erro) não mudam com o nicho, só a marca."
              : "Este segmento ainda não tem paleta própria: o painel segue com a cor padrão."}
          </p>
        </div>
      </CardContent>

      <div className="border-border flex flex-wrap items-center justify-end gap-3 border-t p-5">
        <Button
          type="button"
          variant="ghost"
          disabled={niche === DEFAULT_NICHE && previewNiche === DEFAULT_NICHE}
          onClick={() => {
            setSegment("OTHER");
            setNiche(DEFAULT_NICHE);
          }}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Redefinir para padrão
        </Button>

        <Button type="button" disabled={applied} onClick={() => setNiche(previewNiche)}>
          {applied ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              Tema aplicado
            </>
          ) : (
            "Aplicar no painel"
          )}
        </Button>
      </div>
    </Card>
  );
}
