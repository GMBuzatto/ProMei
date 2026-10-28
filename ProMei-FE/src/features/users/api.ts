import { api } from "@/lib/api";
import type { CompanyUser, UserStatus } from "./types";

/**
 * Chamadas do módulo de usuários. Rota de tenant: a empresa vem do JWT, nunca da URL.
 *
 * `GET /users` devolve a **lista inteira**, sem envelope de paginação — diferente de itens e
 * empresas. Busca e filtros dessas telas são, portanto, do cliente.
 */
export function listUsers(options: { signal?: AbortSignal } = {}) {
  return api.get<CompanyUser[]>("/users", { signal: options.signal });
}

export function getUser(id: string, options: { signal?: AbortSignal } = {}) {
  return api.get<CompanyUser>(`/users/${id}`, { signal: options.signal });
}

export type CreateUserInput = {
  email: string;
  /** Senha temporária. A API marca `mustChangePassword` — troca obrigatória no 1º acesso. */
  password: string;
  /** Sem papel, o usuário nasce sem permissão nenhuma. */
  roleId?: string;
};

/**
 * `POST /users` — RN-14: aqui é onde o limite de usuários do plano é validado.
 *
 * Só usuário **ativo** ocupa vaga, então desativar alguém libera espaço sem apagar histórico.
 * Estourar o limite volta `LIMITE_PLANO_EXCEDIDO` (422) — ver `isPlanLimitError`.
 */
export function createUser(input: CreateUserInput) {
  return api.post<CompanyUser>("/users", input);
}

export type UpdateUserInput = {
  email?: string;
  status?: UserStatus;
};

/**
 * `PATCH /users/:id` — e-mail e status.
 *
 * **Papel não entra aqui**: `UpdateUserDto` da API não aceita `roleId`, e o vínculo
 * usuário↔papel tem rota própria (`/roles/users/:userId`). Reativar consome vaga e passa
 * pelo mesmo limite do plano da criação.
 */
export function updateUser(id: string, input: UpdateUserInput) {
  return api.patch<CompanyUser>(`/users/${id}`, input);
}

/**
 * `DELETE /users/:id` (204) — **desativa**, não exclui.
 *
 * O usuário tem movimentações e trilha de auditoria apontando para ele; apagá-lo deixaria
 * histórico órfão. Recusa com `ULTIMO_ADMIN` se for o último Admin ativo (RN-04).
 */
export function deactivateUser(id: string) {
  return api.delete<void>(`/users/${id}`);
}

export type ResetPasswordInput = {
  userId: string;
  newPassword: string;
};

/**
 * `POST /auth/reset-password` (204) — reset feito pelo Admin (RF-04).
 *
 * Sem e-mail no MVP: o Admin define a senha e repassa por fora; o usuário é obrigado a trocá-la
 * no primeiro acesso. Vive no módulo `auth` da API, mas quem usa é a tela de usuários.
 */
export function resetUserPassword(input: ResetPasswordInput) {
  return api.post<void>("/auth/reset-password", input);
}
