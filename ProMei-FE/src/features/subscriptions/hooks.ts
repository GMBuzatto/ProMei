"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  changeSubscriptionPlan,
  changeSubscriptionStatus,
  createSubscription,
  getCompanySubscription,
} from "./api";
import type { SubscriptionStatus } from "./types";
import type { ChangePlanValues, CreateSubscriptionValues } from "./schemas";

export const subscriptionKeys = {
  all: ["subscriptions"] as const,
  byCompany: (companyId: string) => [...subscriptionKeys.all, "company", companyId] as const,
};

/**
 * Assinatura de uma empresa. `data === null` significa "empresa sem assinatura" — estado
 * normal, tratado em `getCompanySubscription`, e não erro de carregamento.
 */
export function useCompanySubscription(
  companyId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: subscriptionKeys.byCompany(companyId),
    queryFn: ({ signal }) => getCompanySubscription(companyId, { signal }),
    enabled: enabled && companyId.length > 0,
  });
}

/** Troca de plano de quem já tem assinatura (RN-15: efeito imediato). */
export function useChangeSubscriptionPlan(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: ChangePlanValues) => changeSubscriptionPlan(companyId, values.planId),
    onSuccess: (subscription) => {
      queryClient.setQueryData(subscriptionKeys.byCompany(companyId), subscription);
    },
  });
}

/**
 * Transição de estado da assinatura (RN-12).
 *
 * Invalida a empresa junto porque o estado da assinatura decide o acesso dela
 * (`SubscriptionAccessGuard` na API, RN-13).
 */
export function useUpdateSubscriptionStatus(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: SubscriptionStatus) => changeSubscriptionStatus(companyId, status),
    onSuccess: (subscription) => {
      queryClient.setQueryData(subscriptionKeys.byCompany(companyId), subscription);
      void queryClient.invalidateQueries({ queryKey: ["companies", "detail", companyId] });
    },
  });
}

/** Primeira assinatura da empresa. Mesma razão da invalidação acima. */
export function useCreateSubscription(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: CreateSubscriptionValues) => createSubscription(values),
    onSuccess: (subscription) => {
      queryClient.setQueryData(subscriptionKeys.byCompany(companyId), subscription);
      void queryClient.invalidateQueries({ queryKey: ["companies", "detail", companyId] });
    },
  });
}
