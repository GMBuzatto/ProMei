import type { Metadata } from "next";
import { EditRoleScreen } from "@/features/roles/components/edit-role-screen";

export const metadata: Metadata = {
  title: "Editar papel · ProMei",
};

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Papel</h1>
        <p className="text-text-secondary text-sm">
          Papéis de sistema (Admin, Colaborador) são só para consulta.
        </p>
      </header>

      <EditRoleScreen roleId={id} />
    </div>
  );
}
