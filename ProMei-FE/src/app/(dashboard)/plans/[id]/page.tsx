import type { Metadata } from "next";
import { PlanDetails } from "@/features/plans/components/plan-details";

export const metadata: Metadata = {
  title: "Detalhes do plano · ProMei",
  description: "Dados do plano e empresas que o assinam.",
};

export default async function PlanDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <PlanDetails planId={id} />;
}
