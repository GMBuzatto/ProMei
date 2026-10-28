"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { SESSION_EXPIRED_EVENT } from "@/lib/api";
import { buildLoginHref } from "@/features/auth/redirect";
import { getQueryClient } from "@/lib/query-client";

/**
 * Provider do TanStack Query + reação global à queda de sessão.
 *
 * Quando o refresh falha, o client de API dispara `promei:session-expired`. Aqui o cache
 * é zerado (nenhum dado do usuário anterior pode sobrar em tela) e a navegação vai para o
 * login. Concentrar isso em um lugar evita que cada tela tenha que tratar 401 na mão — e é
 * por isso que o `AuthGuard` não redireciona no evento, só esconde o conteúdo.
 *
 * O destino leva `?next=` com a tela atual, igual ao guard: quem foi expulso por expiração
 * volta para onde estava depois de entrar de novo.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  // useState garante um client por montagem do provider, sem recriar a cada render.
  const [queryClient] = useState(getQueryClient);
  const router = useRouter();

  useEffect(() => {
    function handleSessionExpired() {
      queryClient.clear();
      router.replace(buildLoginHref(window.location.pathname, window.location.search));
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [queryClient, router]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
