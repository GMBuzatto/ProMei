import type { Metadata } from "next";
import { EditUserScreen } from "@/features/users/components/edit-user-screen";

export const metadata: Metadata = {
  title: "Editar usuário · ProMei",
};

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Editar usuário</h1>
        <p className="text-text-secondary text-sm">
          E-mail, papel e situação. A empresa precisa manter ao menos um Admin ativo.
        </p>
      </header>

      <EditUserScreen userId={id} />
    </div>
  );
}
