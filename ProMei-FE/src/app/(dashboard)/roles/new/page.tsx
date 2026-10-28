import type { Metadata } from "next";
import { RoleForm } from "@/features/roles/components/role-form";

export const metadata: Metadata = {
  title: "Novo papel · ProMei",
  description: "Defina as permissões de um papel personalizado.",
};

export default function NewRolePage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Novo papel</h1>
        <p className="text-text-secondary text-sm">
          Marque na matriz o que este papel pode fazer em cada recurso.
        </p>
      </header>

      <RoleForm />
    </div>
  );
}
