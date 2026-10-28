import type { Metadata } from "next";
import { PlansList } from "@/features/plans/components/plans-list";

export const metadata: Metadata = {
  title: "Planos · ProMei",
  description: "Gerencie os planos disponíveis na plataforma.",
};

/** RF-21 / RN-10: recurso de plataforma — só Super Admin/Staff. A API é quem recusa os demais. */
export default function PlansPage() {
  return <PlansList />;
}
