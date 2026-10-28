import type { StockMovementType } from "./types";

/**
 * Regras da movimentação que não dependem de React nem de rede (RF-32).
 *
 * Ficam separadas porque decidem duas coisas que a tela não pode errar: para que lado o saldo
 * anda, e quando a saída não cabe no estoque (RN-21).
 */

export type MovementTypeMeta = {
  label: string;
  description: string;
  /** Verbo do botão que conclui a movimentação. */
  action: string;
  tone: "success" | "warning" | "info";
  /**
   * Motivo sugerido. Entrada e saída têm um caso dominante no dia a dia do MEI, e a API exige
   * motivo em toda movimentação — sugerir o comum é o que permite concluir a saída em três
   * cliques (RNF-11) sem esconder o campo, que continua editável.
   *
   * Ajuste nasce vazio de propósito: correção sem explicação é exatamente o que a RN-22 quer
   * evitar no histórico.
   */
  defaultReason: string;
};

export const MOVEMENT_TYPE_META: Record<StockMovementType, MovementTypeMeta> = {
  OUT: {
    label: "Saída",
    description: "Baixa do estoque: venda, consumo ou perda.",
    action: "Registrar saída",
    tone: "warning",
    defaultReason: "Venda",
  },
  IN: {
    label: "Entrada",
    description: "Reposição do estoque: compra ou devolução.",
    action: "Registrar entrada",
    tone: "success",
    defaultReason: "Compra",
  },
  ADJUSTMENT: {
    label: "Ajuste",
    description: "Correção do saldo após conferência física.",
    action: "Registrar ajuste",
    tone: "info",
    defaultReason: "",
  },
};

export function movementTypeLabel(type: StockMovementType): string {
  return MOVEMENT_TYPE_META[type]?.label ?? type;
}

/**
 * Quanto a movimentação soma ao saldo. Espelha `resolveStockDelta` da API.
 *
 * A direção mora no **tipo**, não no sinal: saída de 10 é enviada como `quantity: 10` e
 * subtrai 10. Ajuste é a exceção — vem assinado, porque correção é a diferença entre o saldo
 * registrado e o contado.
 */
export function stockDelta(type: StockMovementType, quantity: number): number {
  return type === "OUT" ? -quantity : quantity;
}

/** Saldo que o item terá se a movimentação for aceita. */
export function projectedStock(
  currentStock: number,
  type: StockMovementType,
  quantity: number,
): number {
  return currentStock + stockDelta(type, quantity);
}

/**
 * `true` quando a movimentação deixaria o saldo negativo — o que a API recusa com
 * `ESTOQUE_INSUFICIENTE` (RN-21).
 *
 * Serve para avisar **antes** de enviar. Não substitui a resposta da API: entre o cálculo
 * aqui e a gravação lá, outra saída pode consumir o saldo, e quem decide é o banco.
 */
export function exceedsAvailableStock(
  currentStock: number,
  type: StockMovementType,
  quantity: number,
): boolean {
  return projectedStock(currentStock, type, quantity) < 0;
}

/** Só o ajuste aceita quantidade negativa (mesma regra do `acceptsNegativeQuantity` da API). */
export function acceptsNegativeQuantity(type: StockMovementType): boolean {
  return type === "ADJUSTMENT";
}
