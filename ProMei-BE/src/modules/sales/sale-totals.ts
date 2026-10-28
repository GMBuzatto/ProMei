/**
 * Aritmética do dinheiro da venda (docs/19#aritmética-do-dinheiro, RN-44).
 *
 * Funções puras, `Prisma.Decimal` de ponta a ponta — nenhum `Number`
 * intermediário. Converter para `number` para "só somar" é o caminho
 * conhecido para 0,1 + 0,2 (e é o que `customers.service.ts#getFinancialSummary`
 * faz hoje com `creditLimit.toNumber()`; não repetir esse padrão aqui).
 *
 * Ordem de cálculo fixada pela doc:
 *   item.total = round_half_up(unit_price * quantity, 2)
 *   sale.total = Σ item.total - discount
 *   balance    = sale.total - paid_amount
 *
 * Arredondar por item e depois somar, nunca somar cru e arredondar no fim:
 * é assim que a soma das linhas exibidas bate com o total exibido.
 */

import { Prisma } from '../../generated/prisma/client';

const { Decimal } = Prisma;

/**
 * `unit_price × quantity`, arredondado a 2 casas (round half up). A
 * rounding mode é passada explicitamente porque `Decimal.rounding` é
 * configuração global mutável — não dá para confiar no default do processo.
 */
export function calculateItemTotal(unitPrice: Prisma.Decimal, quantity: number): Prisma.Decimal {
  return unitPrice.mul(quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Soma dos totais de item (já arredondados) menos o desconto. Não
 * rearredonda: cada `item.total` chegou em 2 casas, e soma de valores em 2
 * casas continua em 2 casas.
 */
export function calculateSaleTotal(
  itemTotals: Prisma.Decimal[],
  discount: Prisma.Decimal,
): Prisma.Decimal {
  const itemsSum = itemTotals.reduce((sum, itemTotal) => sum.plus(itemTotal), new Decimal(0));
  return itemsSum.minus(discount);
}

/** `sale.total - paid_amount`. */
export function calculateBalance(
  saleTotal: Prisma.Decimal,
  paidAmount: Prisma.Decimal,
): Prisma.Decimal {
  return saleTotal.minus(paidAmount);
}

/**
 * `sale.total > 0` já é `CHECK` no banco; esta função existe para o service
 * devolver o erro de negócio (`VALIDACAO_FALHOU`) antes de chegar lá.
 * Desconto igual ou maior que o total dos itens não é desconto, é venda de
 * valor zero ou negativo — proibido pela mesma regra.
 */
export function isDiscountValid(itemsSum: Prisma.Decimal, discount: Prisma.Decimal): boolean {
  return discount.lt(itemsSum);
}
