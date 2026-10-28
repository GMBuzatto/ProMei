"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { hasSession } from "@/lib/api";
import { DEFAULT_AUTHENTICATED_ROUTE, LOGIN_ROUTE } from "@/lib/routes";

/**
 * Rota raiz: não tem conteúdo próprio — só decide para onde mandar. Com sessão (mesmo que
 * seja só o refresh token pós-reload, que o client renova sozinho), vai para o painel;
 * sem, para o login.
 *
 * Client-side pelo mesmo motivo do `AuthGuard`: a sessão vive em memória/`localStorage`,
 * invisível ao servidor (docs/09-seguranca.md) — um redirect de servidor mandaria todo
 * mundo, logado ou não, para o login.
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(hasSession() ? DEFAULT_AUTHENTICATED_ROUTE : LOGIN_ROUTE);
  }, [router]);

  return (
    <main
      role="status"
      aria-busy="true"
      className="bg-background text-foreground flex min-h-screen items-center justify-center"
    >
      <span className="sr-only">Redirecionando...</span>
      <div className="bg-background-subtle h-8 w-40 animate-pulse rounded-md motion-reduce:animate-none" />
    </main>
  );
}
