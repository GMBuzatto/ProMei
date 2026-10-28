/**
 * Situação financeira do cliente (docs/18, docs/21, RN-62).
 *
 * Função pura, mesmo formato de `decideAccess` em
 * `src/shared/access/access-policy.ts`: a regra que decide se alguém compra
 * fiado precisa ser legível e testável sem banco, sem HTTP e sem mocks.
 *
 * Sem timezone aqui de propósito: `now` já chega resolvido como "meia-noite
 * de hoje no fuso da empresa" — quem resolve o fuso é o chamador (mesma
 * divisão de responsabilidade de `finance/period.ts`). Esta função só faz
 * aritmética de calendário sobre instantes já corretos.
 */

import { CustomerFinancialStatus } from '../../generated/prisma/client';

const MS_PER_DAY = 86_400_000;

/**
 * Uma venda em aberto do cliente — já filtrada pelo chamador para
 * `status ∈ {PENDING, PARTIALLY_PAID, OVERDUE}` (docs/21). `balance` é
 * `total − paid_amount`.
 */
export interface OpenSaleForStatus {
  dueDate: Date;
  balance: number;
}

/**
 * RN-61: `due_date < hoje`, estritamente — no dia do vencimento a venda
 * ainda não está vencida.
 * RN-62: `DELINQUENT` quando existe venda vencida com `dias_de_atraso >=
 * delinquencyDays`; `OVERDUE` quando existe vencida mas nenhuma alcança o
 * limiar; `REGULAR` quando não há nenhuma vencida.
 *
 * O pior atraso entre as vendas vencidas é o que decide — um cliente com uma
 * venda vencida há 40 dias e outra em dia é `DELINQUENT` pela primeira, não
 * "meio inadimplente".
 */
export function decideCustomerFinancialStatus(
  openSales: OpenSaleForStatus[],
  now: Date,
  delinquencyDays: number,
): CustomerFinancialStatus {
  let worstOverdueDays = -1;

  for (const sale of openSales) {
    // Defensivo: o contrato já pede saldo > 0, mas custa nada não confiar cegamente.
    if (sale.balance <= 0) continue;
    if (sale.dueDate.getTime() >= now.getTime()) continue;

    const overdueDays = Math.floor((now.getTime() - sale.dueDate.getTime()) / MS_PER_DAY);
    if (overdueDays > worstOverdueDays) worstOverdueDays = overdueDays;
  }

  if (worstOverdueDays < 0) return CustomerFinancialStatus.REGULAR;
  if (worstOverdueDays >= delinquencyDays) return CustomerFinancialStatus.DELINQUENT;
  return CustomerFinancialStatus.OVERDUE;
}
