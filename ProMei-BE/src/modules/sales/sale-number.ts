/**
 * Número da venda como aparece na tela e no telefone (docs/19, RN-46):
 * sequencial por empresa, zero-padded. `000123` com padding 6.
 *
 * O padding é só apresentação — o valor gravado é o `BIGINT`, e é ele que a
 * unicidade `(company_id, number)` protege. Mesma ideia de
 * `receipts/receipt-number.ts#formatReceiptNumber`, duplicada de propósito:
 * são sequências e namespaces de lock diferentes (`SALES_NUMBER_PADDING` ≠
 * `RECEIPT_NUMBER_PADDING`), e nem toda venda gera comprovante em todos os
 * cenários futuros.
 */
export function formatSaleNumber(number: bigint | number, padding: number): string {
  return number.toString().padStart(padding, '0');
}
