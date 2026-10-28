import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Códigos de negócio expostos ao cliente (ver docs/08-padroes-de-desenvolvimento.md).
 */
export const BusinessErrorCode = {
  ESTOQUE_INSUFICIENTE: 'ESTOQUE_INSUFICIENTE',
  LIMITE_PLANO_EXCEDIDO: 'LIMITE_PLANO_EXCEDIDO',
  RECURSO_NAO_ENCONTRADO: 'RECURSO_NAO_ENCONTRADO',
  PERMISSAO_NEGADA: 'PERMISSAO_NEGADA',
  VALIDACAO_FALHOU: 'VALIDACAO_FALHOU',
  ERRO_INTERNO: 'ERRO_INTERNO',
  /** Rate limit estourado (429). Emitido pelo AppThrottlerGuard, não por um service. */
  LIMITE_DE_REQUISICOES: 'LIMITE_DE_REQUISICOES',
  CREDENCIAIS_INVALIDAS: 'CREDENCIAIS_INVALIDAS',
  CONTA_BLOQUEADA: 'CONTA_BLOQUEADA',
  REFRESH_INVALIDO: 'REFRESH_INVALIDO',
  SESSAO_INVALIDADA: 'SESSAO_INVALIDADA',
  NAO_AUTENTICADO: 'NAO_AUTENTICADO',
  TROCA_DE_SENHA_OBRIGATORIA: 'TROCA_DE_SENHA_OBRIGATORIA',
  SENHA_ATUAL_INCORRETA: 'SENHA_ATUAL_INCORRETA',
  SENHA_INVALIDA: 'SENHA_INVALIDA',
  USUARIO_NAO_ENCONTRADO: 'USUARIO_NAO_ENCONTRADO',
  PAPEL_DE_SISTEMA_IMUTAVEL: 'PAPEL_DE_SISTEMA_IMUTAVEL',
  PAPEL_JA_EXISTE: 'PAPEL_JA_EXISTE',
  PERMISSAO_INEXISTENTE: 'PERMISSAO_INEXISTENTE',
  ULTIMO_ADMIN: 'ULTIMO_ADMIN',
  TOKEN_INVALIDO: 'TOKEN_INVALIDO',
  TRANSICAO_INVALIDA: 'TRANSICAO_INVALIDA',
  EMPRESA_SEM_ACESSO: 'EMPRESA_SEM_ACESSO',
  ACESSO_SOMENTE_LEITURA: 'ACESSO_SOMENTE_LEITURA',
  ASSINATURA_JA_EXISTE: 'ASSINATURA_JA_EXISTE',
  ASSINATURA_NAO_ENCONTRADA: 'ASSINATURA_NAO_ENCONTRADA',
  EMAIL_JA_CADASTRADO: 'EMAIL_JA_CADASTRADO',
  SKU_JA_EXISTE: 'SKU_JA_EXISTE',
  ITEM_INATIVO: 'ITEM_INATIVO',
  /** docs/28: 404 das rotas de cliente — específico, e nunca 403 (não confirma existência). */
  CLIENTE_NAO_ENCONTRADO: 'CLIENTE_NAO_ENCONTRADO',
  DOCUMENTO_JA_CADASTRADO: 'DOCUMENTO_JA_CADASTRADO',
  /** docs/28: teto de FINANCE_MAX_CREDIT_LIMIT excedido em PATCH /customers/:id/credit-limit. */
  LIMITE_INVALIDO: 'LIMITE_INVALIDO',
  COMPROVANTE_NAO_GERADO: 'COMPROVANTE_NAO_GERADO',
  SKU_NAO_GERADO: 'SKU_NAO_GERADO',
  CONFLITO_DE_CONCORRENCIA: 'CONFLITO_DE_CONCORRENCIA',
  /** docs/28: id de venda não resolve nesta empresa — 404, nunca 403. */
  VENDA_NAO_ENCONTRADA: 'VENDA_NAO_ENCONTRADA',
  /** docs/19, docs/28: 422 com o campo extra `blocks` — ver `AllExceptionsFilter`. */
  VENDA_BLOQUEADA: 'VENDA_BLOQUEADA',
  /** docs/22, docs/28: RN-72 — venda cancelada não recebe pagamento. */
  VENDA_CANCELADA: 'VENDA_CANCELADA',
  /** docs/22, docs/28: RN-71 — recebimento acima do saldo pendente (PD-11). */
  PAGAMENTO_EXCEDE_SALDO: 'PAGAMENTO_EXCEDE_SALDO',
  /** docs/28: id de recebimento não resolve nesta empresa — 404, nunca 403. */
  PAGAMENTO_NAO_ENCONTRADO: 'PAGAMENTO_NAO_ENCONTRADO',
  /** docs/22, docs/28: RN-74 — recebimento já estornado não é estornável de novo. */
  PAGAMENTO_JA_ESTORNADO: 'PAGAMENTO_JA_ESTORNADO',
} as const;

export type BusinessErrorCode = (typeof BusinessErrorCode)[keyof typeof BusinessErrorCode];

export class BusinessException extends HttpException {
  constructor(
    readonly code: BusinessErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
    /**
     * Campos extras do corpo do erro (docs/28), ex.: `{ blocks: [...] }` em
     * `VENDA_BLOQUEADA`. `AllExceptionsFilter` os repassa para a resposta.
     */
    readonly extra?: Record<string, unknown>,
  ) {
    super({ code, message, ...extra }, status);
  }
}
