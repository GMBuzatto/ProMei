import { SaleStatus, type Prisma } from '../../generated/prisma/client';
// Arquivo-folha, não o barrel `../sales` — evita puxar `sales.module.ts`
// por uma função pura (mesmo raciocínio já registrado em receipts.service.ts
// e sales.service.ts).
import { calculateBalance } from '../sales/sale-totals';
import type { OpenSaleForStatus } from './customer-status.policy';

/**
 * Vendas em aberto do cliente, no formato que `decideCustomerFinancialStatus`
 * espera (docs/18, docs/21). Compartilhado por `SalesService` (venda a
 * prazo nova) e `PaymentsService` (recebimento pode regularizar ou
 * reinadimplir) — duplicar esta consulta nos dois services seria criar
 * dois lugares para corrigir o mesmo bug.
 */
export async function fetchOpenSalesForStatus(
  tx: Prisma.TransactionClient,
  companyId: string,
  customerId: string,
): Promise<OpenSaleForStatus[]> {
  const openSales = await tx.sale.findMany({
    where: {
      companyId,
      customerId,
      status: { in: [SaleStatus.PENDING, SaleStatus.PARTIALLY_PAID, SaleStatus.OVERDUE] },
    },
    select: { dueDate: true, total: true, paidAmount: true },
  });

  return openSales.map((sale) => ({
    dueDate: sale.dueDate!,
    balance: calculateBalance(sale.total, sale.paidAmount).toNumber(),
  }));
}
