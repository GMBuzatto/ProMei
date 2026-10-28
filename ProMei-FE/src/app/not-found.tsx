import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = {
  title: "Página não encontrada · ProMei",
};

/**
 * 404 do painel.
 *
 * Existe porque a página padrão do Next é **em inglês** ("This page could not be found") e
 * não passa pelo layout nem pelos tokens do tema — dois motivos independentes para não
 * deixá-la aparecer para o usuário (UI em pt-BR, docs/08).
 */
export default function NotFound() {
  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-text-tertiary font-mono text-sm">404</p>

      <h1 className="text-2xl font-bold tracking-tight">Página não encontrada</h1>

      <p className="text-text-secondary max-w-prose text-sm">
        O endereço que você abriu não existe ou foi movido. Se você chegou aqui por um link do
        painel, avise o suporte.
      </p>

      <Link href="/dashboard" className={buttonVariants({ variant: "primary" })}>
        Voltar para o painel
      </Link>
    </main>
  );
}
