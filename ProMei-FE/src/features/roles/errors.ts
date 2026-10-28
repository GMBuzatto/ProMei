import { BusinessErrorCode, isApiError } from "@/lib/api";

/**
 * Recusas de negócio da gestão de papéis (RF-12).
 *
 * As três têm saída diferente de "tente de novo", então a tela precisa distingui-las do erro
 * genérico para dizer o que fazer.
 */

/** Papel de sistema (Admin, Colaborador) — a API não deixa alterar nem excluir. */
export function isSystemRoleError(error: unknown): boolean {
  return isApiError(error) && error.code === BusinessErrorCode.PAPEL_DE_SISTEMA_IMUTAVEL;
}

/** Nome de papel repetido dentro da empresa. */
export function isRoleNameTakenError(error: unknown): boolean {
  return isApiError(error) && error.code === BusinessErrorCode.PAPEL_JA_EXISTE;
}

/** Alguma permissão enviada não existe no catálogo — a mensagem da API lista quais. */
export function isUnknownPermissionError(error: unknown): boolean {
  return isApiError(error) && error.code === BusinessErrorCode.PERMISSAO_INEXISTENTE;
}
