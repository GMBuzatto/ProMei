/**
 * Espelho dos tipos de movimentação de estoque (ProMei-BE, módulo `inventory` — RF-32).
 *
 * Rota de tenant (`/stock-movements`): a empresa vem do JWT, nunca do corpo. Não existe
 * PATCH nem DELETE lá de propósito — movimentação é imutável, e correção é um **ajuste**
 * (RN-22). A ausência dos verbos é a regra sendo aplicada.
 */

import type { ReceiptSummary } from "@/features/receipts/types";

export const STOCK_MOVEMENT_TYPES = ["IN", "OUT", "ADJUSTMENT"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export type StockMovement = {
  id: string;
  companyId: string;
  itemId: string;
  userId: string;
  type: StockMovementType;
  /** Quanto o saldo se move — não o saldo final. */
  quantity: number;
  reason: string;
  createdAt: string;
};

/** Saldo do item depois da movimentação, devolvido junto para a tela não recalcular nada. */
export type MovementItemSnapshot = {
  id: string;
  sku: string;
  name: string;
  stock: number;
};

export type StockMovementResult = {
  movement: StockMovement;
  item: MovementItemSnapshot;
  /** Só saída gera comprovante (RF-33). */
  receipt: ReceiptSummary | null;
};

/**
 * Linha do histórico (`GET /stock-movements` — RF-34).
 *
 * Vem com item e autor já resolvidos pela API, então a tabela não faz uma requisição por
 * linha. Note que `reason` é anulável aqui, diferente do POST: movimentação antiga pode não
 * ter motivo, e a tela precisa lidar com isso sem quebrar.
 */
export type StockMovementHistoryEntry = {
  id: string;
  type: StockMovementType;
  /** Quanto o saldo se moveu. Direção de `IN`/`OUT` vem do tipo; ajuste vem assinado. */
  quantity: number;
  reason: string | null;
  createdAt: string;
  item: { id: string; sku: string; name: string };
  user: { id: string; email: string };
  /**
   * Comprovante da saída (RF-33). `null` em entrada e ajuste, que não geram nenhum.
   *
   * **Opcional de propósito:** o `findAll` da API ainda não seleciona esse campo. Enquanto
   * não selecionar, a coluna de comprovante mostra "—" em vez de quebrar — e volta a exibir
   * o número no dia em que o campo chegar, sem mudança aqui.
   */
  receipt?: ReceiptSummary | null;
};
