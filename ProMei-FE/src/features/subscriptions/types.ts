import type { Plan } from "@/features/plans/types";

/**
 * Espelho dos tipos de assinatura da API (ProMei-BE, módulo `subscriptions` — RF-22/23).
 *
 * Recurso de plataforma: quem administra cobrança é Super Admin/Staff, não a própria
 * empresa (RN-10).
 */

/** `SubscriptionStatus` do Prisma (RN-12). */
export const SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "CANCELED"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Assinatura da empresa. Uma empresa tem no máximo uma — daí a rota ser indexada por
 * `companyId` e não pelo id da assinatura.
 *
 * `plan` chega embutido (a API faz `include: { plan: true }`), mas é opcional aqui porque o
 * tipo declarado no controller é o `Subscription` cru.
 */
export type Subscription = {
  id: string;
  companyId: string;
  planId: string;
  status: SubscriptionStatus;
  /** ISO 8601 — `@db.Date` na API: só a parte da data tem significado. */
  renewsAt: string;
  createdAt: string;
  updatedAt: string;
  plan?: Plan;
};

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}
