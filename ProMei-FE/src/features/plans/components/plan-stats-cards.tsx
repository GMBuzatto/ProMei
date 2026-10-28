"use client";

import { CalendarClock, CalendarRange, Layers, Wallet } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import type { Plan } from "../types";

/**
 * Resumo dos planos.
 *
 * Três dos quatro números do mockup não existem hoje: "planos ativos" exigiria um campo de
 * status que o modelo `Plan` não tem, e "receita mensal (MRR)" e "empresas assinantes"
 * exigiriam contar assinaturas por plano — a API só devolve assinatura por empresa
 * (`GET /subscriptions/:companyId`), uma por requisição.
 *
 * Em vez de inventar, os cards mostram o que a listagem realmente sustenta e o MRR fica
 * explicitamente indisponível: é o número que decidiria conversa de cobrança, e um chute ali
 * é pior que uma lacuna.
 */
export function PlanStatsCards({
  plans,
  total,
  loading,
}: {
  plans: Plan[];
  total: number;
  loading: boolean;
}) {
  const monthly = plans.filter((plan) => plan.period === "monthly").length;
  const yearly = plans.filter((plan) => plan.period === "yearly").length;

  return (
    <section aria-label="Resumo dos planos" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Total de planos"
        icon={Layers}
        tone="brand"
        value={total}
        loading={loading}
      />
      <StatCard
        label="Cobrança mensal"
        icon={CalendarClock}
        tone="success"
        value={monthly}
        hint="Nesta página"
        loading={loading}
      />
      <StatCard
        label="Cobrança anual"
        icon={CalendarRange}
        tone="neutral"
        value={yearly}
        hint="Nesta página"
        loading={loading}
      />
      <StatCard
        label="Receita mensal (MRR)"
        icon={Wallet}
        tone="warning"
        unavailable="Exige contar assinaturas por plano, e a API ainda não expõe isso."
      />
    </section>
  );
}
