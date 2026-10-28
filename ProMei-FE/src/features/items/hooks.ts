"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createItem,
  deleteItem,
  getItem,
  listItems,
  updateItem,
  updateItemStatus,
  type ListItemsParams,
} from "./api";
import type { ItemStatus } from "./types";
import type { ItemValues } from "./schemas";

/** Chaves do cache. Centralizadas para invalidação não depender de string solta. */
export const itemKeys = {
  all: ["items"] as const,
  lists: () => [...itemKeys.all, "list"] as const,
  list: (params: ListItemsParams) => [...itemKeys.lists(), params] as const,
  detail: (id: string) => [...itemKeys.all, "detail", id] as const,
};

/**
 * Listagem com busca, filtro e paginação — tudo resolvido pela API (RF-31).
 *
 * `keepPreviousData` porque busca e filtro mudam a chave a cada tecla digitada: sem ele, a
 * tabela piscaria para o esqueleto entre um resultado e o próximo, e a página inteira saltaria
 * embaixo de quem está digitando.
 */
export function useItems(params: ListItemsParams = {}) {
  return useQuery({
    queryKey: itemKeys.list(params),
    queryFn: ({ signal }) => listItems(params, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useItem(id: string) {
  return useQuery({
    queryKey: itemKeys.detail(id),
    queryFn: ({ signal }) => getItem(id, { signal }),
    enabled: id.length > 0,
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: ItemValues) => createItem(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
    },
  });
}

export function useUpdateItem(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: ItemValues) => updateItem(id, values),
    onSuccess: (item) => {
      queryClient.setQueryData(itemKeys.detail(id), item);
      void queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
    },
  });
}

/** Ativo ⇄ inativo. O saldo e o histórico continuam intactos. */
export function useUpdateItemStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: ItemStatus) => updateItemStatus(id, status),
    onSuccess: (item) => {
      queryClient.setQueryData(itemKeys.detail(id), item);
      void queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
    },
  });
}

/**
 * Exclusão com os dois desfechos da RN-23.
 *
 * Só as listagens são invalidadas: invalidar `itemKeys.all` alcançaria o detalhe do item
 * recém-excluído e dispararia um `GET /items/:id` que a API responde com 404 — a tela ainda
 * montada exibiria esse erro em vez de sair de cena.
 *
 * Item **inativado** continua existindo, então o detalhe dele é atualizado, não removido.
 */
export function useDeleteItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: (result) => {
      if (result.outcome === "DELETED") {
        queryClient.removeQueries({ queryKey: itemKeys.detail(result.id) });
      } else {
        void queryClient.invalidateQueries({ queryKey: itemKeys.detail(result.id) });
      }

      void queryClient.invalidateQueries({ queryKey: itemKeys.lists() });
    },
  });
}
