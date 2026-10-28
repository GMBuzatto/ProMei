import { api } from "@/lib/api";
import type { PaginatedResult } from "@/types/api";
import type { StockMovementHistoryEntry, StockMovementResult, StockMovementType } from "./types";

export type CreateStockMovementInput = {
  itemId: string;
  type: StockMovementType;
  /**
   * Quanto o saldo se move. `IN`/`OUT` sempre positiva — o tipo já diz a direção; só
   * `ADJUSTMENT` aceita sinal. Zero é recusado pela API nos três: movimentação que não move
   * nada é ruído no histórico.
   */
  quantity: number;
  /** Obrigatório em toda movimentação: RF-32 exige o motivo. */
  reason: string;
};

/** `POST /stock-movements` — a única forma de o saldo de um item mudar (RF-32/RN-22). */
export function createStockMovement(input: CreateStockMovementInput) {
  return api.post<StockMovementResult>("/stock-movements", input);
}

export type ListStockMovementsParams = {
  page?: number;
  limit?: number;
  /** UUID do item. A API filtra por igualdade — não há busca textual aqui. */
  itemId?: string;
  /** Inclusivos, comparados contra `createdAt`. ISO 8601. */
  dateFrom?: string;
  dateTo?: string;
};

/**
 * `GET /stock-movements` — histórico filtrável por item e período (RF-34).
 *
 * O histórico é a listagem do próprio recurso, não um sub-recurso: a mesma rota do POST.
 * Exige `stock-movements:read`, permissão diferente da de registrar.
 */
export function listStockMovements(
  params: ListStockMovementsParams = {},
  options: { signal?: AbortSignal } = {},
) {
  return api.get<PaginatedResult<StockMovementHistoryEntry>>("/stock-movements", {
    signal: options.signal,
    query: {
      page: params.page,
      limit: params.limit,
      itemId: params.itemId || undefined,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    },
  });
}
