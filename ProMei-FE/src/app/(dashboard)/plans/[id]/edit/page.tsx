import type { Metadata } from "next";
import { EditPlanScreen } from "@/features/plans/components/edit-plan-screen";

export const metadata: Metadata = {
  title: "Editar plano · ProMei",
};

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Editar plano</h1>
        <p className="text-text-secondary text-sm">
          Alterações valem para novas cobranças; empresas que já assinam mantêm o vínculo.
        </p>
      </header>

      <EditPlanScreen planId={id} />
    </div>
  );
}
