import { BusinessErrorCode, isApiError } from "@/lib/api";

/**
 * Reconhecimento do erro de CNPJ repetido no cadastro de empresa.
 *
 * A API não tem código próprio para esse caso: `POST /companies` responde `409` com o
 * código genérico `VALIDACAO_FALHOU` — o mesmo de qualquer validação — e uma mensagem em
 * inglês ("A company with this document already exists"). Sem um código específico, a
 * identificação depende do par **status + código**, e é por isso que ela mora aqui, num
 * lugar só: quando a API ganhar um `DOCUMENTO_JA_CADASTRADO`, esta função é o único ponto
 * do front que muda.
 *
 * O casamento é seguro dentro do cadastro de empresa porque as outras recusas dessa rota
 * têm código próprio (`EMAIL_JA_CADASTRADO`, `RECURSO_NAO_ENCONTRADO`); o outro
 * `409 VALIDACAO_FALHOU` da API está em `DELETE /plans/:id`, que estas telas não chamam.
 * Por isso a função não é genérica: use-a só sobre o erro de criar/editar empresa.
 */
export function isDuplicateDocumentError(error: unknown): boolean {
  if (!isApiError(error)) return false;
  return error.statusCode === 409 && error.code === BusinessErrorCode.VALIDACAO_FALHOU;
}
