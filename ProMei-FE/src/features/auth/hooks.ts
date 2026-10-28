"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getRefreshToken, type Session } from "@/lib/api";
import { decodeJwt } from "@/lib/jwt";
import { CHANGE_PASSWORD_ROUTE, LOGIN_ROUTE } from "@/lib/routes";
import { readRequestedRoute } from "./redirect";
import { changePassword, login, logout, type ChangePasswordInput, type LoginInput } from "./api";

export function useLogin() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation<Session, unknown, LoginInput>({
    mutationFn: login,
    onSuccess: (session) => {
      // Cache do usuário anterior não pode sobreviver a uma nova sessão.
      queryClient.clear();

      // RF-04: senha definida por outra pessoa precisa ser trocada antes de qualquer coisa.
      // Sem este desvio o usuário cairia no painel e tomaria 403 em toda requisição, porque
      // o `PasswordChangeRequiredGuard` bloqueia tudo menos a própria troca.
      if (decodeJwt(session.accessToken)?.must_change_password) {
        router.replace(CHANGE_PASSWORD_ROUTE);
        return;
      }

      // Volta para a tela que o usuário tentou abrir antes do login (`?next=`), se houver.
      router.replace(readRequestedRoute());
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation<void, unknown, void>({
    mutationFn: async () => {
      const refreshToken = getRefreshToken();
      if (refreshToken) await logout(refreshToken);
    },
    onSettled: () => {
      queryClient.clear();
      // Logout é intencional: sem `?next=`, ninguém quer voltar para onde estava.
      router.replace(LOGIN_ROUTE);
    },
  });
}

/**
 * Troca de senha pelo próprio usuário.
 *
 * Termina no login, e não no painel: a API revoga todas as sessões ao trocar a senha, então
 * a credencial em mãos deixou de valer no mesmo instante. Entrar de novo é o passo real —
 * fingir que a sessão continua viva só adiaria o erro.
 */
export function useChangePassword() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation<void, unknown, ChangePasswordInput>({
    mutationFn: changePassword,
    onSuccess: () => {
      queryClient.clear();
      router.replace(`${LOGIN_ROUTE}?senha-alterada=1`);
    },
  });
}
