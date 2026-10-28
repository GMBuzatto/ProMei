/**
 * Códigos de negócio devolvidos pela API no campo `code` do envelope de erro
 * (`{ statusCode, code, message, correlationId }` — docs/08-padroes-de-desenvolvimento.md).
 *
 * Espelho do enum de `ProMei-BE/src/shared/errors/business.exception.ts`. Enum de domínio
 * espelhado da API não é configuração — pode viver no código (docs/16-configuracao-sem-hardcode.md).
 *
 * O tipo é aberto de propósito (`| (string & {})`): a API pode ganhar um código novo antes
 * do front, e nesse caso a UI ainda exibe `code` + `message` sem quebrar o build.
 */
export const BusinessErrorCode = {
  ESTOQUE_INSUFICIENTE: "ESTOQUE_INSUFICIENTE",
  LIMITE_PLANO_EXCEDIDO: "LIMITE_PLANO_EXCEDIDO",
  RECURSO_NAO_ENCONTRADO: "RECURSO_NAO_ENCONTRADO",
  PERMISSAO_NEGADA: "PERMISSAO_NEGADA",
  VALIDACAO_FALHOU: "VALIDACAO_FALHOU",
  ERRO_INTERNO: "ERRO_INTERNO",
  /** Rate limit da API (429). Emitido pelo AppThrottlerGuard, não por um service. */
  LIMITE_DE_REQUISICOES: "LIMITE_DE_REQUISICOES",
  CREDENCIAIS_INVALIDAS: "CREDENCIAIS_INVALIDAS",
  CONTA_BLOQUEADA: "CONTA_BLOQUEADA",
  REFRESH_INVALIDO: "REFRESH_INVALIDO",
  SESSAO_INVALIDADA: "SESSAO_INVALIDADA",
  NAO_AUTENTICADO: "NAO_AUTENTICADO",
  TROCA_DE_SENHA_OBRIGATORIA: "TROCA_DE_SENHA_OBRIGATORIA",
  SENHA_ATUAL_INCORRETA: "SENHA_ATUAL_INCORRETA",
  SENHA_INVALIDA: "SENHA_INVALIDA",
  USUARIO_NAO_ENCONTRADO: "USUARIO_NAO_ENCONTRADO",
  PAPEL_DE_SISTEMA_IMUTAVEL: "PAPEL_DE_SISTEMA_IMUTAVEL",
  PAPEL_JA_EXISTE: "PAPEL_JA_EXISTE",
  PERMISSAO_INEXISTENTE: "PERMISSAO_INEXISTENTE",
  ULTIMO_ADMIN: "ULTIMO_ADMIN",
  TOKEN_INVALIDO: "TOKEN_INVALIDO",
  TRANSICAO_INVALIDA: "TRANSICAO_INVALIDA",
  EMPRESA_SEM_ACESSO: "EMPRESA_SEM_ACESSO",
  ACESSO_SOMENTE_LEITURA: "ACESSO_SOMENTE_LEITURA",
  ASSINATURA_JA_EXISTE: "ASSINATURA_JA_EXISTE",
  ASSINATURA_NAO_ENCONTRADA: "ASSINATURA_NAO_ENCONTRADA",
  EMAIL_JA_CADASTRADO: "EMAIL_JA_CADASTRADO",
  SKU_JA_EXISTE: "SKU_JA_EXISTE",
  ITEM_INATIVO: "ITEM_INATIVO",
  COMPROVANTE_NAO_GERADO: "COMPROVANTE_NAO_GERADO",
  SKU_NAO_GERADO: "SKU_NAO_GERADO",
  CONFLITO_DE_CONCORRENCIA: "CONFLITO_DE_CONCORRENCIA",
} as const;

export type KnownBusinessErrorCode = (typeof BusinessErrorCode)[keyof typeof BusinessErrorCode];

export type BusinessErrorCodeValue = KnownBusinessErrorCode | (string & {});

/** Códigos usados pelo cliente quando o erro nem chegou à API (rede, timeout, parse). */
export const ClientErrorCode = {
  /** Falha de rede: DNS, offline, CORS, API fora do ar. */
  FALHA_DE_REDE: "FALHA_DE_REDE",
  /** Requisição excedeu `NEXT_PUBLIC_API_TIMEOUT_MS`. */
  TIMEOUT: "TIMEOUT",
  /** Requisição cancelada pelo chamador (navegação, novo input). */
  REQUISICAO_CANCELADA: "REQUISICAO_CANCELADA",
  /** Resposta veio fora do envelope esperado (proxy, HTML de erro, body vazio). */
  RESPOSTA_INVALIDA: "RESPOSTA_INVALIDA",
} as const;

export type ClientErrorCode = (typeof ClientErrorCode)[keyof typeof ClientErrorCode];
