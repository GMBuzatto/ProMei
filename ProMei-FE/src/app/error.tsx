"use client";

import { Button } from "@/components/ui/button";
import { getCorrelationId } from "@/lib/api";

/**
 * Fronteira de erro do painel.
 *
 * Sem ela, uma exceção não tratada cai na tela padrão do Next — em inglês ("Application
 * error: a client-side exception has occurred") e sem nada que ajude o suporte.
 *
 * O `digest` é o identificador que o Next registra no log do servidor, e o correlation id
 * acompanha erros que vieram da API: os dois são o que fecha o caminho entre o print do
 * usuário e a linha do log (docs/13-observabilidade.md).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const correlationId = getCorrelationId(error);

  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Algo deu errado</h1>

      <p className="text-text-secondary max-w-prose text-sm">
        Não foi possível carregar esta tela. Tente de novo. Se continuar acontecendo, fale com o
        suporte informando o código abaixo.
      </p>

      {(error.digest ?? correlationId) ? (
        <p className="text-text-tertiary font-mono text-xs">
          <span className="sr-only">Código do erro: </span>
          {[error.digest, correlationId].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      <Button type="button" onClick={reset}>
        Tentar de novo
      </Button>
    </main>
  );
}
