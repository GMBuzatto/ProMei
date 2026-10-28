import type { Item } from "./types";

/**
 * Alerta de estoque mínimo (RF-35).
 *
 * A conta (`stock < minStock`) é feita pela API e chega em `belowMinStock`. Estas funções não
 * refazem a conta — só decidem **como** o alerta aparece, e são separadas dos componentes
 * porque a mesma regra é usada na listagem, no detalhe e no resumo da página.
 */

export type StockLevel = "ok" | "low" | "empty";

/**
 * Nível do saldo para fins de alerta.
 *
 * Saldo zerado é destacado mesmo quando o item não tem mínimo definido (`minStock = 0`, que
 * desliga o alerta): "acabou" é informação útil sozinha, e sem isso um item zerado sem
 * mínimo passaria despercebido na listagem.
 */
export function stockLevel(item: Pick<Item, "stock" | "minStock" | "belowMinStock">): StockLevel {
  if (item.stock <= 0) return "empty";
  return item.belowMinStock ? "low" : "ok";
}

export function isStockAlert(item: Pick<Item, "stock" | "minStock" | "belowMinStock">): boolean {
  return stockLevel(item) !== "ok";
}

/** Explicação do alerta, para acompanhar o destaque visual em vez de só colorir o número. */
export function stockAlertLabel(
  item: Pick<Item, "stock" | "minStock" | "belowMinStock">,
): string | undefined {
  const level = stockLevel(item);

  if (level === "empty") return "Sem estoque";
  if (level === "low") return `Abaixo do mínimo (${item.minStock})`;
  return undefined;
}

/** Quantos itens da página estão em alerta — o resumo no topo da listagem. */
export function countStockAlerts(
  items: Pick<Item, "stock" | "minStock" | "belowMinStock">[],
): number {
  return items.filter(isStockAlert).length;
}

/**
 * Itens em alerta primeiro, do mais urgente para o menos (RF-35).
 *
 * A ordem é a da decisão de compra: o que **acabou** vem antes do que está só abaixo do
 * mínimo, e dentro de cada grupo o saldo menor vem primeiro. Sem isso, um resumo de cinco
 * linhas mostraria o alerta que a API devolveu primeiro, não o que precisa de atenção.
 *
 * Devolve um array novo — a lista de origem vem do cache do TanStack Query e não pode ser
 * reordenada no lugar.
 */
export function sortByStockUrgency<T extends Pick<Item, "stock" | "minStock" | "belowMinStock">>(
  items: T[],
): T[] {
  const rank: Record<StockLevel, number> = { empty: 0, low: 1, ok: 2 };

  return [...items].sort((a, b) => {
    const byLevel = rank[stockLevel(a)] - rank[stockLevel(b)];
    if (byLevel !== 0) return byLevel;

    return a.stock - b.stock;
  });
}
