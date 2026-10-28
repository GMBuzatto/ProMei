import type { Item } from "@/features/items/types";
import { createStockMovement } from "./api";
import { parseLineQuantity, type MovementLine } from "./lines";
import type { StockMovementResult, StockMovementType } from "./types";

/**
 * Gravação de uma movimentação com vários itens.
 *
 * Como a API grava um item por requisição, o "lote" é uma sequência — e **não é atômico**.
 * Duas decisões saem daí:
 *
 * 1. **Sequencial, não em paralelo.** Saídas do mesmo item concorrem pelo mesmo saldo (a API
 *    usa `SELECT FOR UPDATE`), e disparar tudo junto tornaria a ordem — e portanto quem toma
 *    o erro de saldo — imprevisível. Em sequência, o resultado é o mesmo que registrar uma
 *    por uma na mão.
 * 2. **A falha de uma linha não interrompe as outras.** Parar no primeiro erro deixaria o
 *    lote pela metade *e* sem tentar o resto; seguir e relatar por linha dá à pessoa a lista
 *    exata do que faltou — que é o que ela precisa para tentar de novo só o que falhou.
 */

export type MovementLineOutcome =
  | { item: Item; status: "success"; result: StockMovementResult }
  | { item: Item; status: "error"; quantity: string; error: unknown };

export type MovementBatchResult = {
  outcomes: MovementLineOutcome[];
  succeeded: MovementLineOutcome[];
  failed: MovementLineOutcome[];
};

export async function registerMovementBatch({
  lines,
  type,
  reason,
}: {
  lines: MovementLine[];
  type: StockMovementType;
  reason: string;
}): Promise<MovementBatchResult> {
  const outcomes: MovementLineOutcome[] = [];

  for (const line of lines) {
    const quantity = parseLineQuantity(line.quantity);

    if (quantity === null || quantity === 0) {
      // A tela já barra isto antes de enviar; aqui é rede de segurança para nunca mandar
      // quantidade inválida à API.
      outcomes.push({
        item: line.item,
        status: "error",
        quantity: line.quantity,
        error: new Error("Quantidade inválida."),
      });
      continue;
    }

    try {
      const result = await createStockMovement({ itemId: line.item.id, type, quantity, reason });
      outcomes.push({ item: line.item, status: "success", result });
    } catch (error) {
      outcomes.push({ item: line.item, status: "error", quantity: line.quantity, error });
    }
  }

  return {
    outcomes,
    succeeded: outcomes.filter((outcome) => outcome.status === "success"),
    failed: outcomes.filter((outcome) => outcome.status === "error"),
  };
}
