import type { Metadata } from "next";
import { PlanForm } from "@/features/plans/components/plan-form";

export const metadata: Metadata = {
  title: "Novo plano · ProMei",
  description: "Cadastre um plano da plataforma.",
};

export default function NewPlanPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Novo plano</h1>
        <p className="text-text-secondary text-sm">
          Defina preço, periodicidade e limites do plano.
        </p>
      </header>

      <PlanForm />
    </div>
  );
}
