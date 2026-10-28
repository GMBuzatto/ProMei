import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CustomerStatusReason,
  Prisma,
  SaleStatus,
  type Customer,
  type Payment,
  type Sale,
} from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BusinessErrorCode, BusinessException } from '../../shared/errors';
import type { Env } from '../../shared/config';
import { applyLockTimeout, translateConcurrencyError } from '../../shared/concurrency';
import { AuditService } from '../audit/audit.service';
import { FinanceSettingsService, resolveToday } from '../finance';
// Arquivos-folha, não os barrels `../sales`/`../customers` — evita puxar
// `sales.module.ts`/`customers.module.ts` por funções puras/de consulta
// (mesmo raciocínio já registrado em receipts.service.ts e sales.service.ts).
import { calculateBalance } from '../sales/sale-totals';
import { decideSaleStatus } from '../sales/sale-status.policy';
import { decideCustomerFinancialStatus } from '../customers/customer-status.policy';
import { fetchOpenSalesForStatus } from '../customers/open-sales-for-status';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { CreatePaymentReversalDto } from './dto/create-payment-reversal.dto';

const { Decimal } = Prisma;

const PAYMENTS_RESOURCE = 'payments';

/** Mensagem de negócio do 409 (docs/22#concorrência). */
const LOCK_TIMEOUT_MESSAGE =
  'Outro recebimento está em andamento para esta venda. Tente novamente.';

export interface PaymentResponse {
  id: string;
  saleId: string;
  amount: string;
  method: Payment['method'];
  paidAt: string;
  notes: string | null;
  createdAt: string;
  sale: {
    id: string;
    status: Sale['status'];
    paidAmount: string;
    balance: string;
  };
  customer: { id: string; financialStatus: Customer['financialStatus'] } | null;
}

export interface PaymentReversalResponse {
  outcome: 'REVERSED';
  payment: {
    id: string;
    saleId: string;
    amount: string;
    reversedAt: string;
    reversedBy: string;
    reversalReason: string;
  };
  sale: {
    id: string;
    status: Sale['status'];
    paidAmount: string;
    balance: string;
  };
  customer: { id: string; financialStatus: Customer['financialStatus'] } | null;
}

/** Linha travada pelo `SELECT ... FOR UPDATE` na venda. */
interface LockedSaleRow {
  id: string;
  customer_id: string | null;
  status: SaleStatus;
  total: Prisma.Decimal | string;
  paid_amount: Prisma.Decimal | string;
  due_date: Date | null;
  canceled_at: Date | null;
}

/** Linha travada pelo `SELECT ... FOR UPDATE` no recebimento (estorno). */
interface LockedPaymentRow {
  id: string;
  sale_id: string;
  amount: Prisma.Decimal | string;
  reversed_at: Date | null;
}

/**
 * Recebimentos (docs/22, docs/28, RN-70 a RN-76).
 *
 * `POST /payments` trava a venda (`SELECT ... FOR UPDATE`) antes de somar
 * `paid_amount` — sem isso, dois recebimentos simultâneos leriam o mesmo
 * saldo e cada um somaria sobre o valor antigo. Ordem de lock: venda →
 * cliente, sempre (a venda a prazo trava cliente → itens; recebimento
 * nunca trava item, então as duas ordens não se cruzam).
 *
 * Tudo na MESMA transação: `INSERT payment` → `UPDATE sales.paid_amount,
 * status` → recalcula a situação do cliente → `customer_status_events` se
 * mudou.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
    private readonly financeSettings: FinanceSettingsService,
  ) {}

  async create(
    companyId: string,
    userId: string,
    dto: CreatePaymentDto,
    ip?: string,
  ): Promise<PaymentResponse> {
    const result = await this.prisma
      .withTenantSession(
        async (tx) => {
          await applyLockTimeout(tx, this.config.get('PAYMENTS_LOCK_TIMEOUT_MS', { infer: true }));

          // Ordem de lock FIXA: venda → cliente (docs/22#concorrência).
          const sale = await this.lockSale(tx, companyId, dto.saleId);

          if (!sale) {
            throw new BusinessException(
              BusinessErrorCode.VENDA_NAO_ENCONTRADA,
              'Venda não encontrada',
              HttpStatus.NOT_FOUND,
            );
          }

          // RN-72: venda cancelada não recebe pagamento.
          if (sale.status === SaleStatus.CANCELED) {
            throw new BusinessException(
              BusinessErrorCode.VENDA_CANCELADA,
              'Venda cancelada não recebe pagamento',
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
          }

          const total = new Decimal(String(sale.total));
          const paidAmount = new Decimal(String(sale.paid_amount));
          const balance = calculateBalance(total, paidAmount);
          const amount = new Decimal(dto.amount);

          // RN-71, PD-11: acima do saldo é recusado — nunca vira crédito
          // do cliente contra a empresa.
          if (amount.gt(balance)) {
            throw new BusinessException(
              BusinessErrorCode.PAGAMENTO_EXCEDE_SALDO,
              `Pagamento de ${this.formatBrl(amount)} excede o saldo pendente de ${this.formatBrl(balance)}.`,
              HttpStatus.UNPROCESSABLE_ENTITY,
              { balance: balance.toFixed(2) },
            );
          }

          const settings = await this.financeSettings.getMySettings(companyId);
          const now = new Date();
          const paidAt = dto.paidAt ? new Date(dto.paidAt) : now;

          // docs/28: paidAt não pode ser no futuro, com a tolerância do
          // fuso da empresa — "hoje" resolvido no fuso, nunca comparação
          // crua de timestamptz.
          if (
            resolveToday(paidAt, settings.timezone).getTime() >
            resolveToday(now, settings.timezone).getTime()
          ) {
            throw new BusinessException(
              BusinessErrorCode.VALIDACAO_FALHOU,
              'paidAt não pode ser no futuro',
              HttpStatus.BAD_REQUEST,
            );
          }

          const newPaidAmount = paidAmount.plus(amount);
          // RN-73: tabela de decisão de docs/21 — quitação parcial de
          // título vencido NÃO regulariza (segue OVERDUE enquanto due_date
          // < hoje e houver saldo); só `paid = total` fecha em PAID.
          const newStatus = decideSaleStatus({
            total,
            paidAmount: newPaidAmount,
            dueDate: sale.due_date,
            canceledAt: sale.canceled_at,
            now,
          });

          const payment = await tx.payment.create({
            data: {
              companyId,
              saleId: sale.id,
              customerId: sale.customer_id,
              amount,
              method: dto.method,
              paidAt,
              notes: dto.notes ?? null,
              createdBy: userId,
            },
          });

          const updatedSale = await tx.sale.update({
            where: { id: sale.id },
            data: { paidAmount: newPaidAmount, status: newStatus },
          });

          let customer: Customer | null = null;

          if (sale.customer_id) {
            customer = await this.recalculateCustomerStatus(
              tx,
              companyId,
              sale.customer_id,
              now,
              settings.timezone,
              settings.delinquencyDays,
              payment.id,
              userId,
              CustomerStatusReason.PAYMENT,
            );
          }

          return { payment, sale: updatedSale, customer };
        },
        {
          timeout: this.config.get('PAYMENTS_TRANSACTION_TIMEOUT_MS', { infer: true }),
          maxWait: this.config.get('PAYMENTS_LOCK_TIMEOUT_MS', { infer: true }),
        },
      )
      .catch((error: unknown) => {
        throw translateConcurrencyError(error, LOCK_TIMEOUT_MESSAGE);
      });

    // Auditoria FORA da transação de propósito: erro ao auditar não pode
    // desfazer um recebimento válido (mesmo raciocínio de SalesService).
    await this.audit.log({
      action: 'payment.created',
      resource: PAYMENTS_RESOURCE,
      userId,
      companyId,
      diff: {
        paymentId: result.payment.id,
        saleId: result.sale.id,
        amount: result.payment.amount.toString(),
        method: result.payment.method,
        saleStatus: result.sale.status,
      },
      ip,
    });

    return this.toResponse(result);
  }

  /**
   * `POST /payments/:id/reversal` (docs/22, docs/28, PD-15, RN-74, RN-76).
   * Recebimento nunca é apagado nem editado: marca `reversed_at` e devolve o
   * valor ao saldo. Ordem de lock: venda → recebimento — o recebimento é
   * filho da venda, travar a venda primeiro é o que serializa qualquer
   * disputa sobre o mesmo pagamento (duas tentativas de estornar o mesmo
   * recebimento, ou estornar enquanto outro recebimento é lançado).
   */
  async reverse(
    companyId: string,
    userId: string,
    paymentId: string,
    dto: CreatePaymentReversalDto,
    ip?: string,
  ): Promise<PaymentReversalResponse> {
    const result = await this.prisma
      .withTenantSession(
        async (tx) => {
          await applyLockTimeout(tx, this.config.get('PAYMENTS_LOCK_TIMEOUT_MS', { infer: true }));

          const preview = await tx.payment.findFirst({
            where: { id: paymentId, companyId },
            select: { saleId: true },
          });

          if (!preview) {
            throw new BusinessException(
              BusinessErrorCode.PAGAMENTO_NAO_ENCONTRADO,
              'Recebimento não encontrado',
              HttpStatus.NOT_FOUND,
            );
          }

          const sale = await this.lockSale(tx, companyId, preview.saleId);
          const payment = await this.lockPayment(tx, companyId, paymentId);

          if (!sale || !payment) {
            throw new BusinessException(
              BusinessErrorCode.PAGAMENTO_NAO_ENCONTRADO,
              'Recebimento não encontrado',
              HttpStatus.NOT_FOUND,
            );
          }

          // RN-74: recebimento já estornado não é estornável de novo — o
          // `SELECT ... FOR UPDATE` acima é o que torna esta checagem
          // confiável sob concorrência (duas tentativas de estornar o mesmo
          // recebimento se serializam pela venda, e a segunda enxerga o
          // `reversed_at` já commitado pela primeira).
          if (payment.reversed_at !== null) {
            throw new BusinessException(
              BusinessErrorCode.PAGAMENTO_JA_ESTORNADO,
              'Recebimento já foi estornado',
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
          }

          const now = new Date();
          const amount = new Decimal(String(payment.amount));
          const total = new Decimal(String(sale.total));
          const paidAmount = new Decimal(String(sale.paid_amount));
          const newPaidAmount = paidAmount.minus(amount);

          // RN-76: pode reinadimplir — se o título volta a ter saldo e já
          // está vencido, a mesma tabela de decisão de `decideSaleStatus`
          // devolve OVERDUE.
          const newStatus = decideSaleStatus({
            total,
            paidAmount: newPaidAmount,
            dueDate: sale.due_date,
            canceledAt: sale.canceled_at,
            now,
          });

          const reversedPayment = await tx.payment.update({
            where: { id: paymentId },
            data: { reversedAt: now, reversedBy: userId, reversalReason: dto.reason },
          });

          const updatedSale = await tx.sale.update({
            where: { id: sale.id },
            data: { paidAmount: newPaidAmount, status: newStatus },
          });

          let customer: Customer | null = null;

          if (sale.customer_id) {
            const settings = await this.financeSettings.getMySettings(companyId);
            customer = await this.recalculateCustomerStatus(
              tx,
              companyId,
              sale.customer_id,
              now,
              settings.timezone,
              settings.delinquencyDays,
              paymentId,
              userId,
              CustomerStatusReason.PAYMENT_REVERSAL,
            );
          }

          return { payment: reversedPayment, sale: updatedSale, customer };
        },
        {
          timeout: this.config.get('PAYMENTS_TRANSACTION_TIMEOUT_MS', { infer: true }),
          maxWait: this.config.get('PAYMENTS_LOCK_TIMEOUT_MS', { infer: true }),
        },
      )
      .catch((error: unknown) => {
        throw translateConcurrencyError(error, LOCK_TIMEOUT_MESSAGE);
      });

    // Auditoria FORA da transação de propósito, mesmo raciocínio de `create`.
    await this.audit.log({
      action: 'payment.reversed',
      resource: PAYMENTS_RESOURCE,
      userId,
      companyId,
      diff: {
        paymentId: result.payment.id,
        saleId: result.sale.id,
        amount: result.payment.amount.toString(),
        reason: result.payment.reversalReason,
        saleStatus: result.sale.status,
      },
      ip,
    });

    return this.toReversalResponse(result);
  }

  private toReversalResponse(result: {
    payment: Payment;
    sale: Sale;
    customer: Customer | null;
  }): PaymentReversalResponse {
    return {
      outcome: 'REVERSED',
      payment: {
        id: result.payment.id,
        saleId: result.payment.saleId,
        amount: result.payment.amount.toFixed(2),
        reversedAt: result.payment.reversedAt!.toISOString(),
        reversedBy: result.payment.reversedBy!,
        reversalReason: result.payment.reversalReason!,
      },
      sale: {
        id: result.sale.id,
        status: result.sale.status,
        paidAmount: result.sale.paidAmount.toFixed(2),
        balance: calculateBalance(result.sale.total, result.sale.paidAmount).toFixed(2),
      },
      customer: result.customer
        ? { id: result.customer.id, financialStatus: result.customer.financialStatus }
        : null,
    };
  }

  private toResponse(result: {
    payment: Payment;
    sale: Sale;
    customer: Customer | null;
  }): PaymentResponse {
    return {
      id: result.payment.id,
      saleId: result.payment.saleId,
      amount: result.payment.amount.toFixed(2),
      method: result.payment.method,
      paidAt: result.payment.paidAt.toISOString(),
      notes: result.payment.notes,
      createdAt: result.payment.createdAt.toISOString(),
      sale: {
        id: result.sale.id,
        status: result.sale.status,
        paidAmount: result.sale.paidAmount.toFixed(2),
        balance: calculateBalance(result.sale.total, result.sale.paidAmount).toFixed(2),
      },
      customer: result.customer
        ? { id: result.customer.id, financialStatus: result.customer.financialStatus }
        : null,
    };
  }

  /**
   * RN-76: recalcula a situação do cliente a partir das vendas em aberto —
   * nunca confia em `customers.financial_status`. Um recebimento pode
   * REGULARIZAR (quitou o último título vencido) ou REINADIMPLIR (estorno
   * devolveu saldo a um título já vencido). Só grava `customer_status_events`
   * quando a situação realmente muda.
   */
  private async recalculateCustomerStatus(
    tx: Prisma.TransactionClient,
    companyId: string,
    customerId: string,
    now: Date,
    timezone: string,
    delinquencyDays: number,
    paymentId: string,
    userId: string,
    reason: CustomerStatusReason,
  ): Promise<Customer> {
    const customer = await tx.customer.findFirstOrThrow({ where: { id: customerId, companyId } });
    const openSales = await fetchOpenSalesForStatus(tx, companyId, customerId);
    const today = resolveToday(now, timezone);

    const recomputed = decideCustomerFinancialStatus(openSales, today, delinquencyDays);

    if (recomputed === customer.financialStatus) return customer;

    const updated = await tx.customer.update({
      where: { id: customerId },
      data: { financialStatus: recomputed },
    });

    await tx.customerStatusEvent.create({
      data: {
        companyId,
        customerId,
        fromStatus: customer.financialStatus,
        toStatus: recomputed,
        reason,
        paymentId,
        userId,
      },
    });

    return updated;
  }

  /**
   * Trava a linha da venda (docs/22#fluxo-do-recebimento) — sem isso, dois
   * recebimentos simultâneos leriam o mesmo `paid_amount` e cada um
   * somaria sobre o valor antigo.
   *
   * Query crua porque `FOR UPDATE` não existe na API do Prisma — e query
   * crua não passa pela Client Extension de tenant, então `company_id`
   * entra à mão. Exatamente como em `SalesService`/`InventoryService`.
   */
  private async lockSale(
    tx: Prisma.TransactionClient,
    companyId: string,
    saleId: string,
  ): Promise<LockedSaleRow | undefined> {
    const rows = await tx.$queryRaw<LockedSaleRow[]>`
      SELECT id, customer_id, status, total, paid_amount, due_date, canceled_at
      FROM sales
      WHERE id = ${saleId}::uuid AND company_id = ${companyId}::uuid
      FOR UPDATE
    `;

    return rows[0];
  }

  /**
   * Trava a linha do recebimento para o estorno (docs/22#estorno-de-recebimento).
   * Sempre chamada DEPOIS de `lockSale` (ordem de lock venda → recebimento):
   * o recebimento é filho da venda, então travar a venda primeiro é o que
   * serializa duas tentativas de estornar o mesmo recebimento.
   */
  private async lockPayment(
    tx: Prisma.TransactionClient,
    companyId: string,
    paymentId: string,
  ): Promise<LockedPaymentRow | undefined> {
    const rows = await tx.$queryRaw<LockedPaymentRow[]>`
      SELECT id, sale_id, amount, reversed_at
      FROM payments
      WHERE id = ${paymentId}::uuid AND company_id = ${companyId}::uuid
      FOR UPDATE
    `;

    return rows[0];
  }

  private formatBrl(value: Prisma.Decimal): string {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  }
}
