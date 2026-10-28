"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { itemKeys } from "@/features/items/hooks";
import {
  createStockMovement,
  listStockMovements,
  type CreateStockMovementInput,
  type ListStockMovementsParams,
} from "./api";
import { registerMovementBatch } from "./batch";

/** Chaves do cache do histórico. Centralizadas para invalidação não depender de string solta. */
export const stockMovementKeys = {
  all: ["stock-movements"] as const,
  lists: () => [...stockMovementKeys.all, "list"] as const,
  list: (params: ListStockMovementsParams) => [...stockMovementKeys.lists(), params] as const,
};

/**
 * Histórico de movimentações (RF-34), paginado pela API.
 *
 * `keepPreviousData` porque trocar o item ou o período muda a chave: sem ele, a tabela
 * piscaria para o esqueleto a cada ajuste de filtro e a página saltaria embaixo de quem lê.
 */
export function useStockMovements(params: ListStockMovementsParams = {}) {
  return useQuery({
    queryKey: stockMovementKeys.list(params),
    queryFn: ({ signal }) => listStockMovements(params, { signal }),
    placeholderData: keepPreviousData,
  });
}

/**
 * Registra uma movimentação.
 *
 * Invalida os itens porque o saldo acabou de mudar — é a movimentação que move o estoque, e
 * qualquer tela que mostre saldo (listagem, detalhe, alerta de mínimo) estaria desatualizada.
 * O histórico também: a movimentação recém-gravada é a primeira linha dele.
 */
export function useCreateStockMovement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateStockMovementInput) => createStockMovement(input),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: itemKeys.detail(result.item.id) });
      void queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: stockMovementKeys.lists() });
    },
  });
}

/**
 * Grava uma movimentação com vários itens (ver `batch.ts`).
 *
 * A mutação **resolve** mesmo quando linhas falham: sucesso parcial é resultado normal aqui,
 * não erro. Quem chama recebe a lista por linha e decide o que mostrar; tratar como erro
 * jogaria fora a informação de quais itens foram gravados.
 */
export function useRegisterMovementBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: registerMovementBatch,
    onSuccess: (batch) => {
      // Qualquer linha gravada mudou saldo: as telas que mostram estoque precisam recarregar.
      if (batch.succeeded.length > 0) {
        void queryClient.invalidateQueries({ queryKey: itemKeys.all });
        void queryClient.invalidateQueries({ queryKey: stockMovementKeys.lists() });
      }
    },
  });
}
