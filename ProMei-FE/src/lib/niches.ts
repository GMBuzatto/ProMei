/**
 * Registro de nichos (segmentos de empresa) com tema próprio.
 * Ver docs/styles/temas/README.md — cada chave aqui precisa de um bloco
 * `[data-niche="<chave>"]` correspondente em src/styles/globals.css.
 */
export const NICHES = [
  { key: "default", label: "Padrão (ProMei)" },
  { key: "alimenticio", label: "Alimentício" },
  { key: "saude", label: "Saúde" },
] as const;

export type NicheKey = (typeof NICHES)[number]["key"];

export const DEFAULT_NICHE: NicheKey = "default";

export const NICHE_STORAGE_KEY = "promei-niche";

export function isNicheKey(value: string | null | undefined): value is NicheKey {
  return NICHES.some((niche) => niche.key === value);
}

/**
 * Script inline (mesmo padrão do next-themes) que aplica `data-niche` a partir do
 * localStorage ANTES da hidratação, evitando flash do tema default. Renderizado em
 * src/app/layout.tsx (Server Component) antes de <NicheProvider>/children — por isso
 * vive aqui e não em niche-provider.tsx (`"use client"`, não pode ser chamado do servidor).
 */
export function getNicheInitScript(): string {
  const validKeys = JSON.stringify(NICHES.map((n) => n.key));
  return `(function(){try{var k=localStorage.getItem(${JSON.stringify(NICHE_STORAGE_KEY)});if(${validKeys}.indexOf(k)!==-1){document.documentElement.setAttribute("data-niche",k);}}catch(e){}})();`;
}
