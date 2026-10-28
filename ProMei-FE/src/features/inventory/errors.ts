import { BusinessErrorCode, isApiError } from "@/lib/api";

/**
 * `true` quando a API recusou a movimentação por saldo insuficiente (RN-21).
 *
 * Diferente do CNPJ duplicado, aqui a API **tem** código próprio (`ESTOQUE_INSUFICIENTE`) e a
 * mensagem dela é a melhor da tela: traz o SKU, o disponível e o solicitado — números que o
 * front não teria como saber no instante da recusa, porque o saldo pode ter mudado entre a
 * conferência e o envio.
 */
export function isInsufficientStockError(error: unknown): boolean {
  return isApiError(error) && error.code === BusinessErrorCode.ESTOQUE_INSUFICIENTE;
}

/** `true` quando a recusa foi por item inativo — o caminho é reativar, não insistir. */
export function isInactiveItemError(error: unknown): boolean {
  return isApiError(error) && error.code === BusinessErrorCode.ITEM_INATIVO;
}
