/**
 * Estado financeiro da venda (docs/19#estados, RN-40 a RN-47).
 *
 * Função pura, mesmo formato de `decideCustomerFinancialStatus` em
 * `customers/customer-status.policy.ts`: `now` já chega resolvido pelo
 * chamador, a função só decide.
 *
 * Prioridade da tabela de decisão, da mais forte para a mais fraca:
 *   1. CANCELED vence tudo (venda cancelada não volta a dever nem a pagar).
 *   2. PAID vence o vencimento — quitada com atraso ainda é PAID, não OVERDUE.
 *   3. Vencida sem quitar → OVERDUE.
 *   4. Sem vencer: PARTIALLY_PAID se já houve algum pagamento, senão PENDING.
 */

import { type Prisma, SaleStatus } from '../../generated/prisma/client';

export interface SaleStatusInput {
  total: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  /** `null` em venda `CASH` — sem vencimento não há atraso. */
  dueDate: Date | null;
  /** `null` enquanto a venda não foi cancelada. */
  canceledAt: Date | null;
  now: Date;
}

export function decideSaleStatus(input: SaleStatusInput): SaleStatus {
  if (input.canceledAt !== null) return SaleStatus.CANCELED;

  const balance = input.total.minus(input.paidAmount);
  if (balance.lte(0)) return SaleStatus.PAID;

  const isOverdue = input.dueDate !== null && input.dueDate.getTime() < input.now.getTime();
  if (isOverdue) return SaleStatus.OVERDUE;

  return input.paidAmount.gt(0) ? SaleStatus.PARTIALLY_PAID : SaleStatus.PENDING;
}
