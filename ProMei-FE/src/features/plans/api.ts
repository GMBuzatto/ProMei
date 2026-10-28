import { api } from "@/lib/api";
import type { PaginatedResult, Plan } from "./types";
import type { PlanValues } from "./schemas";

/**
 * Chamadas do módulo de planos (`@PlatformRoute` na API: cross-tenant, exclusivo de
 * Super Admin/Staff — RN-10).
 */

export type ListPlansParams = {
  page?: number;
  limit?: number;
};

/** `GET /plans`. Como em empresas, a API pagina mas não aceita busca nem filtro. */
export function listPlans(params: ListPlansParams = {}, options: { signal?: AbortSignal } = {}) {
  return api.get<PaginatedResult<Plan>>("/plans", {
    query: { page: params.page, limit: params.limit },
    signal: options.signal,
  });
}

export function getPlan(id: string, options: { signal?: AbortSignal } = {}) {
  return api.get<Plan>(`/plans/${id}`, { signal: options.signal });
}

export function createPlan(input: PlanValues) {
  return api.post<Plan>("/plans", input);
}

/** `PATCH /plans/:id`. O DTO aceita campos parciais; a tela sempre manda o formulário todo. */
export function updatePlan(id: string, input: PlanValues) {
  return api.patch<Plan>(`/plans/${id}`, input);
}

/**
 * `DELETE /plans/:id` — 204.
 *
 * A API recusa com 409 quando existem assinaturas vinculadas ao plano: o histórico de
 * cobrança precisa continuar legível, então plano em uso não some.
 */
export function deletePlan(id: string) {
  return api.delete<void>(`/plans/${id}`);
}
