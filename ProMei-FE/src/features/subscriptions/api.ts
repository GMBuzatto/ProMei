import { api, BusinessErrorCode, isApiError } from "@/lib/api";
import type { Subscription, SubscriptionStatus } from "./types";
import type { CreateSubscriptionValues } from "./schemas";

/**
 * Chamadas do módulo de assinaturas (`@PlatformRoute` na API — RN-10).
 *
 * **A API não lista assinaturas.** Só existe `GET /subscriptions/:companyId`: uma empresa por
 * requisição. Toda tela que precise de um panorama parte da listagem de empresas — ver
 * `useCompanySubscriptions`.
 */

/**
 * `GET /subscriptions/:companyId`.
 *
 * Empresa sem assinatura não é erro de tela — é o estado de quem foi criada antes de o
 * comercial fechar o plano. A API responde 404 `ASSINATURA_NAO_ENCONTRADA`, e aqui isso vira
 * `null`. Qualquer outro erro continua subindo.
 */
export async function getCompanySubscription(
  companyId: string,
  options: { signal?: AbortSignal } = {},
): Promise<Subscription | null> {
  try {
    return await api.get<Subscription>(`/subscriptions/${companyId}`, {
      signal: options.signal,
    });
  } catch (error) {
    if (isApiError(error) && error.code === BusinessErrorCode.ASSINATURA_NAO_ENCONTRADA) {
      return null;
    }
    throw error;
  }
}

/** `POST /subscriptions` — primeira assinatura da empresa (RF-22). Nasce em trial (RN-12). */
export function createSubscription(input: CreateSubscriptionValues) {
  return api.post<Subscription>("/subscriptions", input);
}

/** `PATCH /subscriptions/:companyId/plan` — troca de plano, efeito imediato (RN-15). */
export function changeSubscriptionPlan(companyId: string, planId: string) {
  return api.patch<Subscription>(`/subscriptions/${companyId}/plan`, { planId });
}

/**
 * `PATCH /subscriptions/:companyId/status` — transições da RN-12.
 *
 * A API recusa transição fora da máquina de estados com `TRANSICAO_INVALIDA` (422). A tela
 * só oferece as válidas, mas quem decide é ela.
 */
export function changeSubscriptionStatus(companyId: string, status: SubscriptionStatus) {
  return api.patch<Subscription>(`/subscriptions/${companyId}/status`, { status });
}
