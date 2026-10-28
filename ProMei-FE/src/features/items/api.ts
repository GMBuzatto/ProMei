import { api } from "@/lib/api";
import type { Item, ItemRemovalResult, ItemStatus, PaginatedResult } from "./types";
import type { ItemValues } from "./schemas";

/**
 * Chamadas do módulo de itens. Rota de tenant: a empresa vem do JWT, nunca da URL.
 */

export type ListItemsParams = {
  page?: number;
  limit?: number;
  /** Busca textual em nome, SKU e descrição — feita pela API, não no cliente. */
  search?: string;
  /** Correspondência exata, como a API filtra (`where.category = ...`). */
  category?: string;
  status?: ItemStatus;
};

/**
 * `GET /items` — RF-31.
 *
 * Diferente de empresas e planos, aqui a busca e os filtros são **do servidor**: a query
 * aceita `search`, `category` e `status`. A tela não precisa avisar que filtra só a página,
 * porque não é o caso.
 */
export function listItems(params: ListItemsParams = {}, options: { signal?: AbortSignal } = {}) {
  return api.get<PaginatedResult<Item>>("/items", {
    signal: options.signal,
    query: {
      page: params.page,
      limit: params.limit,
      // String vazia é filtro nenhum: mandar `search=` faria a API buscar pelo vazio.
      search: params.search?.trim() || undefined,
      category: params.category?.trim() || undefined,
      status: params.status,
    },
  });
}

export function getItem(id: string, options: { signal?: AbortSignal } = {}) {
  return api.get<Item>(`/items/${id}`, { signal: options.signal });
}

export function createItem(input: ItemValues) {
  return api.post<Item>("/items", input);
}

export function updateItem(id: string, input: ItemValues) {
  return api.patch<Item>(`/items/${id}`, input);
}

/** `PATCH /items/:id/status` — ativo ⇄ inativo (docs/04). Saldo e histórico não mudam. */
export function updateItemStatus(id: string, status: ItemStatus) {
  return api.patch<Item>(`/items/${id}/status`, { status });
}

/**
 * `DELETE /items/:id` — RN-23.
 *
 * Responde 200 com `{ id, outcome }`: item sem movimentação é excluído, item com histórico é
 * inativado. Quem chama precisa olhar o desfecho para dizer o que de fato aconteceu.
 */
export function deleteItem(id: string) {
  return api.delete<ItemRemovalResult>(`/items/${id}`);
}
