import type { Metadata } from "next";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ChangePasswordForm } from "@/features/auth/components/change-password-form";

export const metadata: Metadata = {
  title: "Nova senha · ProMei",
  description: "Defina uma nova senha para continuar.",
};

/**
 * Troca de senha obrigatória (RF-04).
 *
 * Fica fora do grupo `(dashboard)` de propósito: enquanto a troca está pendente, a API
 * recusa todas as outras rotas com 403 `TROCA_DE_SENHA_OBRIGATORIA`. Mostrar a navegação
 * do painel aqui seria oferecer caminhos que só levariam a erro.
 */
export default function ChangePasswordPage() {
  return (
    <main className="bg-surface flex min-h-svh flex-col">
      <div className="flex justify-end p-6">
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-5 pb-16 sm:px-8">
        <ChangePasswordForm />
      </div>
    </main>
  );
}
