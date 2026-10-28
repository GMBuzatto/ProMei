/**
 * Texto obrigatório no rodapé do comprovante (RN-24).
 *
 * NÃO vem de variável de ambiente, ao contrário do resto da configuração
 * (docs/16): não é valor pré-configurável, é a declaração que impede o
 * comprovante de ser confundido com documento fiscal. Deixar isso ajustável por
 * ambiente permitiria subir uma instância sem o aviso.
 */
export const RECEIPT_NO_FISCAL_VALUE_NOTICE = 'Documento sem valor fiscal';

/**
 * Número do comprovante como ele aparece impresso: sequencial por empresa,
 * zero-padded (RN-24). `000123` com padding 6.
 *
 * O padding é só apresentação — o valor gravado é o inteiro, e é ele que a
 * unicidade `(company_id, number)` protege. Sequencial que passe do padding
 * continua válido e apenas ocupa um dígito a mais.
 */
export function formatReceiptNumber(number: bigint | number, padding: number): string {
  return number.toString().padStart(padding, '0');
}
