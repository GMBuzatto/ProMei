import type { StockMovementHistoryEntry, StockMovementType } from "./types";

/**
 * Regras do histórico de movimentações (RF-34) que não dependem de React nem de rede.
 *
 * A API filtra por **item** e por **período** (`itemId`, `dateFrom`, `dateTo`) e pagina o
 * resto. Não existe filtro por tipo lá — por isso ele mora aqui, e a tela precisa dizer que
 * vale só para a página carregada.
 */

export const HISTORY_PERIODS = [
  { value: "7", label: "Últimos 7 dias", days: 7 },
  { value: "30", label: "Últimos 30 dias", days: 30 },
  { value: "90", label: "Últimos 90 dias", days: 90 },
  { value: "ALL", label: "Todo o período", days: null },
] as const;

export type HistoryPeriod = (typeof HISTORY_PERIODS)[number]["value"];

/**
 * Início do período em ISO, ou `undefined` para "todo o período" (sem `dateFrom` na query).
 *
 * Ancorado na **meia-noite** de `now`, não no instante da chamada: o valor entra na chave de
 * cache do TanStack Query, e um `Date.now()` cru mudaria a cada render, refazendo a
 * requisição sem parar. Zerar a hora também é o que faz "últimos 7 dias" incluir o sétimo dia
 * inteiro, e não só a partir do horário atual.
 */
export function periodStart(period: HistoryPeriod, now: Date = new Date()): string | undefined {
  const preset = HISTORY_PERIODS.find((option) => option.value === period);
  if (!preset || preset.days === null) return undefined;

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // `days - 1` porque hoje já conta como o primeiro dos "últimos N dias".
  start.setDate(start.getDate() - (preset.days - 1));

  return start.toISOString();
}

/** Filtro por tipo aplicado no cliente. `"ALL"` devolve a lista intacta. */
export function filterByType(
  entries: StockMovementHistoryEntry[],
  type: StockMovementType | "ALL",
): StockMovementHistoryEntry[] {
  if (type === "ALL") return entries;
  return entries.filter((entry) => entry.type === type);
}

/**
 * Quantidade como ela deve aparecer no histórico: com sinal e sem `+0`/`-0`.
 *
 * Saída chega positiva da API (a direção está no tipo), então exibir `quantity` cru mostraria
 * "25" para uma baixa de 25 — o histórico ficaria ilegível justamente na linha que mais se
 * audita. Ajuste já vem assinado e é preservado como está.
 */
export function signedQuantity(type: StockMovementType, quantity: number): string {
  const value = type === "OUT" ? -Math.abs(quantity) : quantity;
  return value > 0 ? `+${value}` : String(value);
}
