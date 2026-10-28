/**
 * Espelho dos tipos de plano da API (ProMei-BE, módulo `plans` — RF-21).
 *
 * Plano é recurso de plataforma: só Super Admin/Staff enxergam e gerenciam (RN-10).
 */

/** `PLAN_PERIODS` do `CreatePlanDto`. A cobrança do MVP é mensal ou anual. */
export const PLAN_PERIODS = ["monthly", "yearly"] as const;
export type PlanPeriod = (typeof PLAN_PERIODS)[number];

/** Limites do plano, validados pela API na criação e na edição (RN-14). */
export type PlanLimits = {
  maxUsers: number;
  maxItems: number;
};

export type Plan = {
  id: string;
  name: string;
  /** A API serializa `Decimal` como string para não perder precisão. */
  price: string;
  /**
   * A API aceita apenas `monthly`/`yearly`, mas o tipo é largo de propósito: um período novo
   * cadastrado no back-end precisa aparecer na tela como veio, não sumir do select.
   */
  period: string;
  limits: PlanLimits;
  createdAt: string;
  updatedAt: string;
};

/** Envelope de paginação da API — o compartilhado, como nas demais features. */
export type { PaginatedResult } from "@/types/api";

export function isPlanPeriod(value: unknown): value is PlanPeriod {
  return typeof value === "string" && (PLAN_PERIODS as readonly string[]).includes(value);
}
