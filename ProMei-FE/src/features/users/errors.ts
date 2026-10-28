import { BusinessErrorCode, isApiError } from "@/lib/api";

/**
 * As três recusas de negócio desta tela.
 *
 * Diferente do estoque, aqui as mensagens da API **não** servem para exibir: a de limite do
 * plano chega como "O plan Básico permite 15 usuários activeCount". Por isso a tela reconhece
 * o `code` e escreve a explicação em pt-BR, com a saída possível.
 */

/** RN-14: o plano não comporta mais um usuário ativo. */
export function isPlanLimitError(error: unknown): boolean {
  return isApiError(error) && error.code === BusinessErrorCode.LIMITE_PLANO_EXCEDIDO;
}

/** RN-04: a empresa ficaria sem nenhum Admin ativo. */
export function isLastAdminError(error: unknown): boolean {
  return isApiError(error) && error.code === BusinessErrorCode.ULTIMO_ADMIN;
}

/** E-mail é único **globalmente** na API, não por empresa. */
export function isEmailTakenError(error: unknown): boolean {
  return isApiError(error) && error.code === BusinessErrorCode.EMAIL_JA_CADASTRADO;
}
