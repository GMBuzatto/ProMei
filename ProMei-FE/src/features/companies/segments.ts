import type { LucideIcon } from "lucide-react";
import { Briefcase, Building2, HeartPulse, ShoppingCart, UtensilsCrossed } from "lucide-react";
import { DEFAULT_NICHE, type NicheKey } from "@/lib/niches";
import type { CompanySegment } from "./types";

/**
 * Metadados de cada segmento: como ele aparece na UI e **qual nicho (tema) ele ativa**
 * no painel da empresa.
 *
 * Este arquivo é a ponte entre dois vocabulários que não coincidem:
 * - a API fala `CompanySegment` (FOOD, HEALTH, RETAIL, SERVICES, OTHER);
 * - o tema fala `NicheKey` (chaves dos blocos `[data-niche]` em globals.css).
 *
 * Só `alimenticio` e `saude` têm paleta própria hoje. Os demais segmentos caem em
 * `default` de propósito — docs/styles/temas/README.md registra que as cores oficiais
 * de cada nicho são decisão do time de design/produto, e inventar uma rampa aqui seria
 * hardcode de marca (docs/16-configuracao-sem-hardcode.md). Quando a paleta de varejo
 * ou serviços existir, basta trocar o `niche` abaixo e criar o bloco CSS — nenhum
 * componente muda.
 */
export type SegmentMeta = {
  label: string;
  /** Nicho (tema) aplicado ao painel da empresa com este segmento. */
  niche: NicheKey;
  icon: LucideIcon;
  /** Texto de apoio no seletor, para o Staff entender o que está escolhendo. */
  hint: string;
};

export const SEGMENT_META: Record<CompanySegment, SegmentMeta> = {
  FOOD: {
    label: "Alimentício",
    niche: "alimenticio",
    icon: UtensilsCrossed,
    hint: "Restaurantes, lanchonetes, mercearias e produção de alimentos.",
  },
  HEALTH: {
    label: "Saúde",
    niche: "saude",
    icon: HeartPulse,
    hint: "Clínicas, consultórios, farmácias e cuidados pessoais.",
  },
  RETAIL: {
    label: "Varejo",
    niche: DEFAULT_NICHE,
    icon: ShoppingCart,
    hint: "Lojas, bazares, papelarias e revenda. Venda de produtos no balcão ou online.",
  },
  SERVICES: {
    label: "Serviços",
    niche: DEFAULT_NICHE,
    icon: Briefcase,
    hint: "Salões, oficinas, assistência técnica, consultoria. Quem vende trabalho, não produto.",
  },
  OTHER: {
    label: "Outro",
    niche: DEFAULT_NICHE,
    icon: Building2,
    hint: "Para quem não se encaixa nas opções acima. Nada muda no funcionamento do painel.",
  },
};

/** Nicho (tema) que o segmento ativa. É o que o preview do formulário renderiza. */
export function nicheForSegment(segment: CompanySegment): NicheKey {
  return SEGMENT_META[segment].niche;
}

/**
 * `true` quando o segmento tem paleta própria. Usado para avisar no formulário que
 * varejo/serviços/outro ainda usam a paleta padrão — evita a promessa falsa de que
 * escolher o segmento troca a cor do painel quando não troca.
 */
export function hasDedicatedTheme(segment: CompanySegment): boolean {
  return nicheForSegment(segment) !== DEFAULT_NICHE;
}

export function segmentLabel(segment: CompanySegment): string {
  return SEGMENT_META[segment].label;
}
