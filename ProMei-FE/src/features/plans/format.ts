import { formatMoney } from "@/lib/money";
import type { Plan, PlanPeriod } from "./types";

/**
 * Preço e período do plano: da API para a tela e da tela para a API.
 *
 * Período é assunto de plano e mora aqui; a conversão de dinheiro é de todo o painel e mora
 * em `@/lib/money`.
 */

const PERIOD_LABEL: Record<PlanPeriod, string> = {
  monthly: "Mensal",
  yearly: "Anual",
};

/** Como o período aparece na coluna "Cobrança". Período desconhecido aparece como veio. */
export function periodLabel(period: string): string {
  return PERIOD_LABEL[period as PlanPeriod] ?? period;
}

const PERIOD_SUFFIX: Record<PlanPeriod, string> = {
  monthly: "/mês",
  yearly: "/ano",
};

export function periodSuffix(period: string): string {
  return PERIOD_SUFFIX[period as PlanPeriod] ?? period;
}

/** Preço com o período junto, como aparece na listagem e no seletor de plano. */
export function formatPriceWithPeriod(plan: Pick<Plan, "price" | "period">): string {
  return `${formatMoney(plan.price)} ${periodSuffix(plan.period)}`;
}
