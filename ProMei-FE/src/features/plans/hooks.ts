"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { companyKeys, DIRECTORY_STALE_TIME_MS } from "@/features/companies/hooks";
import { fetchCompanyDirectory } from "@/features/companies/stats";
import { getCompanySubscription } from "@/features/subscriptions/api";
import { subscriptionKeys } from "@/features/subscriptions/hooks";
import { fetchPlanSubscribers } from "./subscribers";
import {
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  updatePlan,
  type ListPlansParams,
} from "./api";
import type { PlanValues } from "./schemas";

/** Chaves do cache. Centralizadas para invalidação não depender de string solta. */
export const planKeys = {
  all: ["plans"] as const,
  lists: () => [...planKeys.all, "list"] as const,
  list: (params: ListPlansParams) => [...planKeys.lists(), params] as const,
  detail: (id: string) => [...planKeys.all, "detail", id] as const,
  subscribers: (id: string) => [...planKeys.all, "detail", id, "subscribers"] as const,
};

/**
 * As assinaturas lidas aqui valem para qualquer plano — quem troca de plano na tela não
 * paga a varredura de novo, porque a segunda visita encontra tudo em cache.
 */
const SUBSCRIBERS_STALE_TIME_MS = 5 * 60_000;

/** `keepPreviousData` para trocar de página sem piscar o esqueleto — como em itens. */
export function usePlans(params: ListPlansParams = {}, { enabled = true } = {}) {
  return useQuery({
    queryKey: planKeys.list(params),
    queryFn: ({ signal }) => listPlans(params, { signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePlan(id: string) {
  return useQuery({
    queryKey: planKeys.detail(id),
    queryFn: ({ signal }) => getPlan(id, { signal }),
    enabled: id.length > 0,
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: PlanValues) => createPlan(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: planKeys.all });
    },
  });
}

export function useUpdatePlan(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: PlanValues) => updatePlan(id, values),
    onSuccess: (plan) => {
      queryClient.setQueryData(planKeys.detail(id), plan);
      void queryClient.invalidateQueries({ queryKey: planKeys.all });
    },
  });
}

/**
 * Exclusão de plano. A API recusa (409) se houver assinatura vinculada — o erro sobe para a
 * tela em vez de ser tratado aqui, porque quem sabe explicar isso é o diálogo.
 */
export function useDeletePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deletePlan(id),
    onSuccess: (_result, id) => {
      // Só as listagens são invalidadas. Invalidar `planKeys.all` alcançaria também o detalhe
      // do plano recém-excluído e dispararia um `GET /plans/:id` que a API responde com 404
      // — a tela de detalhe, ainda montada, exibia esse erro em vez de sair de cena.
      queryClient.removeQueries({ queryKey: planKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: planKeys.lists() });
    },
  });
}

/**
 * Empresas que assinam este plano, da renovação mais próxima para a mais distante.
 *
 * Monta a resposta a partir de duas leituras que a API oferece separadamente (ver
 * `subscribers.ts`) e passa pelo `queryClient`: cada assinatura vai para a **mesma chave**
 * usada pelas telas de empresa, então nada é buscado duas vezes — nem ao alternar entre
 * planos, nem depois de abrir uma empresa.
 */
export function usePlanSubscribers(planId: string) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: planKeys.subscribers(planId),
    enabled: planId.length > 0,
    staleTime: SUBSCRIBERS_STALE_TIME_MS,
    queryFn: () =>
      fetchPlanSubscribers(planId, {
        loadDirectory: () =>
          queryClient.fetchQuery({
            queryKey: companyKeys.directory(),
            queryFn: ({ signal }) => fetchCompanyDirectory({ signal }),
            staleTime: DIRECTORY_STALE_TIME_MS,
          }),
        loadSubscription: (companyId) =>
          queryClient.fetchQuery({
            queryKey: subscriptionKeys.byCompany(companyId),
            queryFn: ({ signal }) => getCompanySubscription(companyId, { signal }),
            staleTime: SUBSCRIBERS_STALE_TIME_MS,
          }),
      }),
  });
}
