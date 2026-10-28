"use client";

import { ApiErrorAlert } from "@/components/api-error-alert";
import { usePlan } from "../hooks";
import { PlanForm } from "./plan-form";

/**
 * Carrega o plano antes de montar o formulário — sem os valores atuais ele nasceria vazio e
 * um "salvar" sobrescreveria o plano com campos em branco.
 */
export function EditPlanScreen({ planId }: { planId: string }) {
  const { data: plan, isPending, error } = usePlan(planId);

  if (isPending) {
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <span className="sr-only">Carregando plano...</span>
        <div className="border-border bg-surface h-96 animate-pulse rounded-lg border" />
      </div>
    );
  }

  if (error) return <ApiErrorAlert error={error} />;
  if (!plan) return null;

  return <PlanForm plan={plan} />;
}
