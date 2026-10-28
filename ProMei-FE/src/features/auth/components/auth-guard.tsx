"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { hasSession, SESSION_EXPIRED_EVENT } from "@/lib/api";
import { CHANGE_PASSWORD_ROUTE } from "@/lib/routes";
import { useUser } from "@/features/auth/context";
import { buildLoginHref } from "@/features/auth/redirect";

/**
 * Guarda das rotas do grupo: sem sessão, ninguém vê conteúdo protegido —
 * vai para `/login` (RF-AUTH em docs/03-requisitos.md).
 *
 * **Isto é UX, não segurança.** Quem decide o que cada usuário pode ver é a API; o guard só
 * evita que alguém sem sessão encare um painel vazio pedindo dados que vão todos falhar em
 * 401. Nenhum dado sensível depende desta checagem — ele nem chega a ser buscado.
 *
 * Por que client-side e não `middleware.ts`: o access token vive só em memória e o refresh
 * fica no `localStorage` (docs/09-seguranca.md — JWT em header, não em cookie). O servidor
 * não enxerga nada disso, então um middleware só saberia dizer "sem sessão" para todo mundo.
 * Se um dia a API migrar para cookie `httpOnly`, a checagem sobe para o middleware e este
 * componente vira redundante.
 *
 * Sessão = `hasSession()`, que aceita "só o refresh token no storage". É o estado normal
 * depois de um F5: o access token some com o reload e o `apiFetch` renova sozinho antes da
 * primeira requisição autenticada. Validar aqui com uma chamada extra à API só adicionaria
 * latência e uma segunda fonte de verdade para o mesmo refresh — se ele estiver morto, o
 * client dispara `SESSION_EXPIRED_EVENT` e o usuário sai de qualquer forma.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  /*
   * Começa em `false` no servidor e no primeiro render do cliente — os dois concordam, sem
   * hydration mismatch. `hasSession()` só é consultado dentro do efeito, onde `localStorage`
   * existe de fato.
   */
  const [allowed, setAllowed] = useState(false);

  const { user, isLoading: isLoadingUser } = useUser();
  const mustChangePassword = user?.must_change_password ?? false;

  useEffect(() => {
    if (!hasSession()) {
      setAllowed(false);
      // `replace` e não `push`: a tela protegida não pode voltar pelo botão "voltar".
      router.replace(buildLoginHref(pathname, window.location.search));
      return;
    }

    // RF-04: com troca de senha pendente a API recusa tudo menos a própria troca, então
    // liberar o painel aqui só entregaria telas que respondem 403. Espera a sessão ser lida
    // antes de decidir — durante o carregamento `user` é nulo e não significa "pode entrar".
    if (isLoadingUser) return;

    if (mustChangePassword) {
      setAllowed(false);
      router.replace(CHANGE_PASSWORD_ROUTE);
      return;
    }

    setAllowed(true);
  }, [pathname, router, isLoadingUser, mustChangePassword]);

  useEffect(() => {
    /*
     * A sessão pode morrer com o usuário parado numa tela protegida (refresh recusado).
     * Quem redireciona e limpa o cache nesse caso é o `QueryProvider`, dono único do evento
     * — aqui só escondemos o conteúdo enquanto a navegação não acontece, sem disparar um
     * segundo `router.replace` concorrente.
     */
    function handleSessionExpired() {
      setAllowed(false);
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  if (!allowed) return <AuthGuardFallback />;

  return <>{children}</>;
}

/**
 * Espaço reservado enquanto a sessão é verificada. Fica *dentro* do `DashboardShell`: a
 * navegação lateral e o header já aparecem (não são conteúdo protegido) e só a área de
 * conteúdo espera — assim o layout não salta quando a sessão é válida, que é o caso comum.
 */
function AuthGuardFallback() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
      <span className="sr-only">Verificando sua sessão...</span>
      <div className="bg-background-subtle h-8 w-2/5 animate-pulse rounded-md" />
      <div className="bg-background-subtle h-4 w-3/5 animate-pulse rounded-md" />
      <div className="border-border bg-surface h-64 animate-pulse rounded-lg border" />
    </div>
  );
}
