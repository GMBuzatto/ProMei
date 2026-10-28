import { ApiError, isApiError } from "./api-error";
import { BusinessErrorCode, ClientErrorCode } from "./business-error-code";

/**
 * Mensagem exibida ao usuário por código de negócio.
 *
 * Só entram aqui os códigos em que a mensagem da API é técnica demais ou genérica demais
 * para a tela. Quando não há entrada, vale a `message` que a própria API mandou — ela é
 * escrita em pt-BR e costuma ser mais específica (traz nome do item, limite do plano...).
 *
 * `LIMITE_DE_REQUISICOES` está fora de propósito: a API devolve a contagem regressiva real
 * ("Aguarde 42s e tente de novo"), e só o servidor sabe esse número. Sobrescrever aqui
 * trocaria uma instrução precisa por um "aguarde alguns minutos" vago.
 */
const MESSAGE_BY_CODE: Partial<Record<string, string>> = {
  [ClientErrorCode.FALHA_DE_REDE]:
    "Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.",
  [ClientErrorCode.TIMEOUT]: "O servidor demorou demais para responder. Tente de novo.",
  [ClientErrorCode.RESPOSTA_INVALIDA]:
    "Recebemos uma resposta inesperada do servidor. Tente de novo em instantes.",
  [BusinessErrorCode.ERRO_INTERNO]:
    "Algo deu errado do nosso lado. Já registramos o problema. Tente de novo em instantes.",
  [BusinessErrorCode.NAO_AUTENTICADO]: "Sua sessão expirou. Entre novamente.",
  [BusinessErrorCode.SESSAO_INVALIDADA]:
    "Sua sessão foi encerrada. Entre novamente para continuar.",
  [BusinessErrorCode.REFRESH_INVALIDO]: "Sua sessão expirou. Entre novamente.",
  [BusinessErrorCode.PERMISSAO_NEGADA]: "Você não tem permissão para esta ação.",
  // Login: a mensagem é do front de propósito. Nunca diferenciar "e-mail não existe" de
  // "senha errada", e nunca repassar detalhe da API nesses três casos (docs/09-seguranca.md).
  [BusinessErrorCode.CREDENCIAIS_INVALIDAS]: "E-mail ou senha inválidos.",
  [BusinessErrorCode.CONTA_BLOQUEADA]:
    "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
  [BusinessErrorCode.EMPRESA_SEM_ACESSO]:
    "Acesso indisponível no momento. Fale com o administrador da sua empresa.",
  // O próprio usuário resolve isto: a API libera `POST /auth/change-password` mesmo com a
  // troca pendente. Mandar procurar o administrador travaria alguém que já pode se destravar.
  [BusinessErrorCode.TROCA_DE_SENHA_OBRIGATORIA]:
    "É necessário definir uma nova senha antes de continuar.",
  [BusinessErrorCode.CONFLITO_DE_CONCORRENCIA]:
    "Este registro mudou enquanto você editava. Recarregue e tente de novo.",
  // Daqui para baixo o motivo é outro: a mensagem da API está **em inglês** e a UI é pt-BR
  // (docs/08). São os códigos em que todas as ocorrências do back-end estão em inglês —
  // onde a API alterna entre inglês e português (`RECURSO_NAO_ENCONTRADO`,
  // `VALIDACAO_FALHOU`), sobrescrever trocaria uma mensagem específica e correta por uma
  // genérica, então esses continuam vindo da API.
  [BusinessErrorCode.SENHA_ATUAL_INCORRETA]: "Senha atual incorreta.",
  // Hoje a API só emite este código para "nova senha igual à atual". Se ela passar a usá-lo
  // para outras recusas de senha, esta linha precisa ficar mais genérica.
  [BusinessErrorCode.SENHA_INVALIDA]: "A nova senha precisa ser diferente da atual.",
  [BusinessErrorCode.EMAIL_JA_CADASTRADO]: "Este e-mail já está cadastrado.",
  [BusinessErrorCode.USUARIO_NAO_ENCONTRADO]: "Usuário não encontrado.",
};

const DEFAULT_MESSAGE = "Não foi possível concluir a ação. Tente de novo.";

/** Texto para exibir ao usuário. Erro desconhecido nunca vaza detalhe técnico na tela. */
export function getErrorMessage(error: unknown): string {
  if (!isApiError(error)) return DEFAULT_MESSAGE;
  return MESSAGE_BY_CODE[error.code] ?? error.message ?? DEFAULT_MESSAGE;
}

/** `code` de negócio para exibir junto da mensagem (aceite do épico) e citar no suporte. */
export function getErrorCode(error: unknown): string | undefined {
  return isApiError(error) ? error.code : undefined;
}

export function getCorrelationId(error: unknown): string | undefined {
  return isApiError(error) ? error.correlationId : undefined;
}

export type DisplayableError = {
  message: string;
  code?: string;
  correlationId?: string;
};

export function toDisplayableError(error: unknown): DisplayableError {
  const apiError: ApiError | undefined = isApiError(error) ? error : undefined;
  return {
    message: getErrorMessage(error),
    code: apiError?.code,
    correlationId: apiError?.correlationId,
  };
}
