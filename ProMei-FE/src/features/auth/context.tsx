"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getAccessToken,
  getRefreshToken,
  refreshSession,
  SESSION_CHANGED_EVENT,
  SESSION_EXPIRED_EVENT,
} from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";
import type { AuthenticatedUser } from "@/types/user";

type UserContextValue = {
  user: AuthenticatedUser | null;
  /** `true` enquanto a sessão ainda não foi lida — não confunda com "não autenticado". */
  isLoading: boolean;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

/** Lê as claims do access token que está em memória. `null` se não houver token utilizável. */
function readUserFromAccessToken(): AuthenticatedUser | null {
  const token = getAccessToken();
  if (!token) return null;

  const claims = decodeJwt(token);
  if (!claims?.sub) return null;

  return {
    sub: claims.sub,
    company_id: claims.company_id ?? null,
    roles: claims.roles ?? [],
    permissions: claims.permissions ?? [],
    must_change_password: claims.must_change_password ?? false,
  };
}

/**
 * Fonte do usuário autenticado para a interface: papéis e permissões que decidem o que
 * renderizar. Decodificar aqui é conveniência de UX — a API revalida tudo.
 *
 * Dois detalhes que este provider precisa tratar, e que não são óbvios:
 *
 * 1. **O access token vive só em memória.** Depois de um F5 ele sumiu, mas a sessão continua
 *    válida (o refresh token está no storage). Ler o token e desistir deixaria o usuário
 *    logado sem papel nenhum, e toda a UI condicionada a permissão desapareceria. Por isso,
 *    quando só há refresh token, o provider renova antes de ler as claims.
 * 2. **O provider monta no layout raiz, antes do login.** Um efeito que roda só na montagem
 *    nunca veria o login acontecer. Daí a inscrição em `SESSION_CHANGED_EVENT`, que o
 *    `session-store` dispara em login, renovação e logout.
 */
export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const syncFromSession = useCallback(async () => {
    let current = readUserFromAccessToken();

    if (!current && getRefreshToken()) {
      try {
        await refreshSession();
        current = readUserFromAccessToken();
      } catch {
        // Refresh recusado: o próprio client já encerrou a sessão e avisou a aplicação.
        current = null;
      }
    }

    setUser(current);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void syncFromSession();

    function handleSessionChanged() {
      void syncFromSession();
    }

    function handleSessionExpired() {
      setUser(null);
      setIsLoading(false);
    }

    window.addEventListener(SESSION_CHANGED_EVENT, handleSessionChanged);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, handleSessionChanged);
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, [syncFromSession]);

  const value = useMemo(() => ({ user, isLoading }), [user, isLoading]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser precisa ser usado dentro de <UserProvider>");
  }
  return context;
}
