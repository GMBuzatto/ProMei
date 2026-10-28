import type { Metadata } from "next";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LoginBrandPanel } from "@/features/auth/components/login-brand-panel";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Entrar · ProMei",
  description: "Acesse o painel de gestão da sua empresa.",
};

/**
 * Tela de login.
 *
 * É o destino de `router.replace("/login")` disparado pelo `QueryProvider` quando o refresh
 * falha (`promei:session-expired`) e pelo `useLogout` — sem esta rota o caminho de sessão
 * expirada terminava em 404.
 *
 * Composição (Server Component fino): painel institucional à esquerda + formulário à direita.
 * Responsividade — `< 768px`: uma coluna, só o formulário (o painel some e a marca aparece
 * dentro dele); `768–1023px`: 40/60 a favor do formulário; `>= 1024px`: 50/50.
 */
export default function LoginPage() {
  return (
    <main className="bg-surface grid min-h-svh grid-cols-1 md:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:grid-cols-2">
      <LoginBrandPanel />

      <div className="flex min-w-0 flex-col">
        <div className="flex justify-end p-6">
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 pt-2 pb-16 sm:px-8">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
