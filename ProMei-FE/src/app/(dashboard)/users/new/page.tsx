import type { Metadata } from "next";
import { UserForm } from "@/features/users/components/user-form";

export const metadata: Metadata = {
  title: "Novo usuário · ProMei",
  description: "Cadastre quem vai usar o sistema com você.",
};

export default function NewUserPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Novo usuário</h1>
        <p className="text-text-secondary text-sm">
          A senha temporária aparece uma única vez, ao concluir o cadastro.
        </p>
      </header>

      <UserForm />
    </div>
  );
}
