import { api, clearSession, setSession, type Session } from "@/lib/api";

export type LoginInput = {
  email: string;
  password: string;
  rememberMe: boolean;
};

/** `POST /auth/login` — resposta idêntica à de `/auth/refresh` (AuthResponseDto da API). */
export async function login(input: LoginInput): Promise<Session> {
  const session = await api.post<Session>("/auth/login", input, { auth: false });
  setSession(session);
  return session;
}

/**
 * `POST /auth/logout` — revoga o refresh token no servidor.
 *
 * A sessão local é limpa mesmo se a chamada falhar: do ponto de vista do usuário o logout
 * precisa acontecer, e um refresh token órfão expira sozinho em 7 dias.
 */
export async function logout(refreshToken: string): Promise<void> {
  try {
    await api.post<void>("/auth/logout", { refreshToken }, { auth: false });
  } finally {
    clearSession();
  }
}

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

/**
 * `POST /auth/change-password` (204) — troca de senha pelo próprio usuário, exigindo a atual.
 *
 * A sessão local é limpa **sempre que a chamada dá certo**, porque a API revoga todos os
 * refresh tokens do usuário ao aplicar a senha nova (`applyNewPassword`). Manter os tokens
 * aqui deixaria a aplicação achando que está autenticada com credencial que o servidor já
 * jogou fora — o próximo request morreria num 401 sem explicação.
 */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await api.post<void>("/auth/change-password", input);
  clearSession();
}
