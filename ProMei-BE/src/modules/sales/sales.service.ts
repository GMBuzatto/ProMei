import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ItemStatus,
  Prisma,
  SaleKind,
  SaleStatus,
  StockMovementOrigin,
  StockMovementType,
  type Customer,
  type Payment,
  type Receipt,
  type Sale,
  type SaleItem,
} from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BusinessErrorCode, BusinessException } from '../../shared/errors';
import type { Env } from '../../shared/config';
import { resolvePagination } from '../../shared/pagination';
import { applyLockTimeout, translateConcurrencyError } from '../../shared/concurrency';
import { AuditService } from '../audit/audit.service';
import { ReceiptsService, type ReceiptSummary } from '../receipts';
import {
  FinanceSettingsService,
  resolvePeriod,
  resolveToday,
  type FinancialPeriod,
} from '../finance';
// Arquivos-folha, não o barrel `../customers` — evita puxar `customers.module.ts`
// (que não depende de `sales`, mas não há motivo para arriscar um ciclo
// por funções puras/de consulta).
import { decideCustomerFinancialStatus } from '../customers/customer-status.policy';
import { fetchOpenSalesForStatus } from '../customers/open-sales-for-status';
import type { CreateSaleDto } from './dto/create-sale.dto';
import type { CreateSaleItemDto } from './dto/create-sale-item.dto';
import type { ListSalesQueryDto } from './dto/list-sales-query.dto';
import { formatSaleNumber } from './sale-number';
import {
  calculateBalance,
  calculateItemTotal,
  calculateSaleTotal,
  isDiscountValid,
} from './sale-totals';
import { decideSaleStatus } from './sale-status.policy';
import {
  SaleValidationService,
  type LockedSaleItem,
  type SaleBlock,
} from './sale-validation.service';

const { Decimal } = Prisma;

const SALES_RESOURCE = 'sales';

/** Namespace do advisory lock de numeração de venda — distinto do de comprovantes (4271). */
const SALE_NUMBERING_LOCK_NAMESPACE = 4272;

/**
 * Namespace do advisory lock de limite de crédito por cliente (docs/20).
 * Constante no código, não configuração: é identificador, como nome de
 * tabela — mudar por ambiente só criaria a chance de dois processos
 * acharem que estão sincronizados quando não estão. Mesmo raciocínio já
 * registrado em `receipts.service.ts` (namespace 4271).
 */
const CUSTOMER_CREDIT_LOCK_NAMESPACE = 4273;

/** Mensagem de negócio do 409 (docs/23#concorrência). */
const LOCK_TIMEOUT_MESSAGE =
  'Outra venda está em andamento para este cliente ou um dos itens. Tente novamente.';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SaleItemResponse {
  itemId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: string;
  total: string;
}

/** Item da resposta de criação: traz `stockAfter` (precedente de `StockMovementResult`). */
export interface CreatedSaleItemResponse extends SaleItemResponse {
  stockAfter: number;
}

export interface SalePaymentResponse {
  id: string;
  amount: string;
  method: Payment['method'];
  paidAt: string;
}

export interface SaleResponseBase {
  id: string;
  number: string;
  formattedNumber: string;
  kind: Sale['kind'];
  status: Sale['status'];
  customer: { id: string; name: string } | null;
  total: string;
  paidAmount: string;
  balance: string;
  dueDate: string | null;
  soldAt: string;
  period: { label: string; start: string; end: string };
  receipt: ReceiptSummary | null;
}

export interface CreateSaleResponse extends SaleResponseBase {
  items: CreatedSaleItemResponse[];
  authorizations: never[];
}

export interface SaleDetailResponse extends SaleResponseBase {
  items: SaleItemResponse[];
  payments: SalePaymentResponse[];
  authorizations: never[];
}

export interface SaleListItem extends SaleResponseBase {
  itemsCount: number;
}

/** Linha travada pelo `SELECT ... FOR UPDATE ORDER BY id`. */
interface LockedItemRow {
  id: string;
  sku: string;
  name: string;
  price: Prisma.Decimal | string;
  stock: number;
  status: ItemStatus;
}

/**
 * Vendas (docs/19, docs/20, docs/21, docs/28, ADR-0006, RN-40 a RN-47,
 * RN-80 a RN-86).
 *
 * `POST /sales` cria e confirma na MESMA transação. Ordem de lock FIXA
 * (docs/20#concorrência): cliente (advisory lock, só em `CREDIT`) → itens
 * (`SELECT ... FOR UPDATE ORDER BY id`). Inverter em um único lugar
 * reintroduz deadlock.
 *
 * Venda à vista nasce `PAID`, com um `Payment` do valor total já
 * registrado. Venda a prazo nasce `PENDING`, consome o limite do período
 * corrente e não gera `Payment` nenhum.
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
    private readonly receipts: ReceiptsService,
    private readonly financeSettings: FinanceSettingsService,
    private readonly validation: SaleValidationService,
  ) {}

  async create(
    companyId: string,
    userId: string,
    dto: CreateSaleDto,
    ip?: string,
  ): Promise<CreateSaleResponse> {
    this.ensureItemCountIsSane(dto.items.length);

    const consolidated = this.consolidateQuantities(dto.items);
    const itemIds = [...consolidated.keys()];
    const isCredit = dto.kind === SaleKind.CREDIT;

    const result = await this.prisma
      .withTenantSession(
        async (tx) => {
          // Ordem de lock FIXA: cliente → itens. Sempre (docs/20). O
          // advisory lock é o PRIMEIRO ato da transação, antes de
          // qualquer leitura de valor — sem isso, duas vendas de R$ 600
          // sobre limite R$ 1.000 leem "utilizado = 0" e as duas passam.
          if (isCredit) {
            await this.lockCustomerCredit(tx, dto.customerId!);
          }

          await applyLockTimeout(tx, this.config.get('SALES_LOCK_TIMEOUT_MS', { infer: true }));

          const lockedItems = await this.lockItems(tx, companyId, itemIds);
          const lockedById = new Map(lockedItems.map((item) => [item.id, item]));

          // 404 imediato para item que não resolveu NESTA empresa — não é
          // bloqueio coletável, é dado inexistente (docs/29#idor).
          for (const itemId of itemIds) {
            if (!lockedById.has(itemId)) {
              throw new BusinessException(
                BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
                `Item não encontrado: ${itemId}`,
                HttpStatus.NOT_FOUND,
              );
            }
          }

          // RN-83: consolidado só decide o bloqueio; a gravação mantém as
          // linhas separadas (preço/desconto podem diferir entre elas).
          const lines = dto.items.map((line) => {
            const item = lockedById.get(line.itemId)!;
            const unitPrice =
              line.unitPrice !== undefined ? new Decimal(line.unitPrice) : new Decimal(item.price);

            return {
              line,
              item,
              unitPrice,
              itemTotal: calculateItemTotal(unitPrice, line.quantity),
            };
          });

          const itemTotals = lines.map((resolved) => resolved.itemTotal);
          const itemsSum = itemTotals.reduce((sum, total) => sum.plus(total), new Decimal(0));
          const discount = new Decimal(dto.discount ?? 0);

          if (!isDiscountValid(itemsSum, discount)) {
            throw new BusinessException(
              BusinessErrorCode.VALIDACAO_FALHOU,
              'discount não pode ser maior ou igual à soma dos itens',
              HttpStatus.BAD_REQUEST,
            );
          }

          const total = calculateSaleTotal(itemTotals, discount);

          const soldAt = new Date();
          const settings = await this.financeSettings.getMySettings(companyId);
          const period = resolvePeriod(soldAt, settings.closingDay, settings.timezone);

          const blocks: SaleBlock[] = this.validation.collectItemBlocks(
            itemIds.map((itemId): LockedSaleItem => {
              const item = lockedById.get(itemId)!;
              return {
                itemId,
                sku: item.sku,
                status: item.status,
                stock: item.stock,
                requestedQuantity: consolidated.get(itemId)!,
              };
            }),
          );

          let customer: Customer | null = null;
          let dueDate: Date | null = null;
          let recomputedFinancialStatus: Customer['financialStatus'] | null = null;

          if (isCredit) {
            customer = await this.findCustomerForCredit(tx, companyId, dto.customerId!);
            dueDate = this.resolveDueDate(dto.dueDate, soldAt, settings);

            // A validação NÃO confia em `customers.financial_status` nem em
            // contador materializado (RN-34): com o cliente já travado,
            // recomputa a partir das vendas. O campo materializado serve
            // para listar e filtrar; a decisão de crédito lê a fonte.
            const openSales = await fetchOpenSalesForStatus(tx, companyId, customer.id);
            const today = resolveToday(soldAt, settings.timezone);
            recomputedFinancialStatus = decideCustomerFinancialStatus(
              openSales,
              today,
              settings.delinquencyDays,
            );

            const usedInPeriod = await this.sumUsedInPeriod(tx, companyId, customer.id, period);

            blocks.push(
              ...this.validation.collectCreditBlocks({
                customerStatus: customer.status,
                blockedForCredit: customer.blockedForCredit,
                financialStatus: recomputedFinancialStatus,
                creditLimit: customer.creditLimit,
                usedInPeriod,
                saleTotal: total,
              }),
            );
          }

          // RN-47: todos os motivos juntos, nunca só o primeiro.
          if (blocks.length > 0) {
            throw new BusinessException(
              BusinessErrorCode.VENDA_BLOQUEADA,
              `A venda não pode ser confirmada: ${String(blocks.length)} impedimento(s).`,
              HttpStatus.UNPROCESSABLE_ENTITY,
              { blocks },
            );
          }

          // Venda à vista nasce com um Payment do valor total já registrado
          // (docs/19): paidAmount = total, balance = 0, PAID por
          // construção. Venda a prazo nasce PENDING, paidAmount = 0.
          const paidAmount = isCredit ? new Decimal(0) : total;
          const status = decideSaleStatus({
            total,
            paidAmount,
            dueDate,
            canceledAt: null,
            now: soldAt,
          });

          const number = await this.allocateSaleNumber(tx, companyId);

          const sale = await tx.sale.create({
            data: {
              companyId,
              customerId: customer?.id ?? null,
              kind: dto.kind,
              status,
              paymentMethod: isCredit ? null : dto.paymentMethod,
              number,
              total,
              discount,
              paidAmount,
              dueDate,
              soldAt,
              periodStart: period.start,
              periodEnd: period.end,
              notes: dto.notes ?? null,
              createdBy: userId,
            },
          });

          const padding: number = this.config.get('SALES_NUMBER_PADDING', { infer: true });
          const reason = `Venda #${formatSaleNumber(number, padding)}`;

          const createdItems: (SaleItem & { item: LockedItemRow })[] = [];
          for (const resolved of lines) {
            const saleItem = await tx.saleItem.create({
              data: {
                companyId,
                saleId: sale.id,
                itemId: resolved.item.id,
                quantity: resolved.line.quantity,
                unitPrice: resolved.unitPrice,
                total: resolved.itemTotal,
                itemNameSnapshot: resolved.item.name,
                itemSkuSnapshot: resolved.item.sku,
              },
            });

            await tx.stockMovement.create({
              data: {
                companyId,
                itemId: resolved.item.id,
                userId,
                type: StockMovementType.OUT,
                quantity: resolved.line.quantity,
                origin: StockMovementOrigin.SALE,
                saleId: sale.id,
                saleItemId: saleItem.id,
                reason,
              },
            });

            createdItems.push({ ...saleItem, item: resolved.item });
          }

          // UPDATE items.stock uma vez por item, com a quantidade JÁ
          // consolidada — RN-83 na gravação também, não só na validação.
          const stockAfterByItem = new Map<string, number>();
          for (const [itemId, quantity] of consolidated) {
            const locked = lockedById.get(itemId)!;
            const stockAfter = locked.stock - quantity;
            await tx.item.update({ where: { id: itemId }, data: { stock: stockAfter } });
            stockAfterByItem.set(itemId, stockAfter);
          }

          let payment: Payment | null = null;

          if (isCredit) {
            // Cache materializado (RN-34): a decisão já leu a fonte; aqui
            // só mantém a listagem/filtro coerentes com o que acabou de
            // ser decidido. Sem `customer_status_events`: uma venda nova
            // não vencida não muda a classificação — não é uma transição.
            if (customer!.financialStatus !== recomputedFinancialStatus) {
              await tx.customer.update({
                where: { id: customer!.id },
                data: { financialStatus: recomputedFinancialStatus! },
              });
            }
          } else {
            payment = await tx.payment.create({
              data: {
                companyId,
                saleId: sale.id,
                customerId: null,
                amount: total,
                method: dto.paymentMethod!,
                paidAt: soldAt,
                createdBy: userId,
              },
            });
          }

          // Um comprovante por VENDA, nunca por item (RN-86) — quem aloca
          // aqui é a venda, com o mesmo advisory lock de numeração que
          // ReceiptsService.allocate já usa para saída manual.
          const receipt = await this.receipts.allocate(tx, companyId, sale.id);

          return { sale, customer, createdItems, payment, receipt, stockAfterByItem, period };
        },
        {
          timeout: this.config.get('SALES_TRANSACTION_TIMEOUT_MS', { infer: true }),
          maxWait: this.config.get('SALES_LOCK_TIMEOUT_MS', { infer: true }),
        },
      )
      .catch((error: unknown) => {
        throw translateConcurrencyError(error, LOCK_TIMEOUT_MESSAGE);
      });

    // Auditoria FORA da transação de propósito: erro ao auditar não pode
    // desfazer uma venda válida (mesmo raciocínio de InventoryService).
    await this.audit.log({
      action: 'sale.created',
      resource: SALES_RESOURCE,
      userId,
      companyId,
      diff: {
        saleId: result.sale.id,
        number: result.sale.number.toString(),
        kind: result.sale.kind,
        total: result.sale.total.toString(),
        itemsCount: result.createdItems.length,
        receiptNumber: result.receipt.number.toString(),
        ...(result.customer ? { customerId: result.customer.id } : {}),
        // docs/28: unitPrice abaixo do cadastro é registrado.
        priceOverrides: result.createdItems
          .filter((item) => item.unitPrice.lt(item.item.price.toString()))
          .map((item) => ({
            itemId: item.itemId,
            listPrice: item.item.price.toString(),
            soldAt: item.unitPrice.toString(),
          })),
      },
      ip,
    });

    // Depois do commit e sem await: o PDF é derivado do banco, e falhar
    // nele não pode desfazer nem atrasar a venda que já aconteceu (docs/06).
    this.receipts.schedulePdfGeneration(result.receipt.id, companyId);

    return this.toCreateResponse(result);
  }

  /** RF-34-like: histórico de vendas, filtrável, sem N+1 no cliente. */
  async findAll(
    companyId: string,
    query: ListSalesQueryDto,
  ): Promise<PaginatedResult<SaleListItem>> {
    this.ensurePeriodIsValid(query);

    const { page, limit, skip } = resolvePagination(this.config, query.page, query.limit);
    const where = this.buildListWhere(companyId, query);

    const [rows, total] = await Promise.all([
      this.prisma.db.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { soldAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true } },
          receipt: true,
          _count: { select: { items: true } },
        },
      }),
      this.prisma.db.sale.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        ...this.toBaseResponse(row, row.customer, row.receipt),
        itemsCount: row._count.items,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * `GET /sales/:id`: venda completa com itens, pagamentos e comprovante.
   * Escopado por `companyId` — venda de outra empresa é 404, nunca 403
   * (docs/29#idor).
   */
  async findOne(id: string, companyId: string): Promise<SaleDetailResponse> {
    const sale = await this.prisma.db.sale.findFirst({
      where: { id, companyId },
      include: {
        customer: { select: { id: true, name: true } },
        receipt: true,
        items: true,
        payments: true,
      },
    });

    if (!sale) {
      throw new BusinessException(
        BusinessErrorCode.VENDA_NAO_ENCONTRADA,
        'Venda não encontrada',
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      ...this.toBaseResponse(sale, sale.customer, sale.receipt),
      items: sale.items.map((item) => this.toItemResponse(item)),
      payments: sale.payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount.toFixed(2),
        method: payment.method,
        paidAt: payment.paidAt.toISOString(),
      })),
      authorizations: [],
    };
  }

  private toCreateResponse(result: {
    sale: Sale;
    customer: Customer | null;
    createdItems: (SaleItem & { item: LockedItemRow })[];
    receipt: Receipt;
    stockAfterByItem: Map<string, number>;
    period: FinancialPeriod;
  }): CreateSaleResponse {
    const customer = result.customer
      ? { id: result.customer.id, name: result.customer.name }
      : null;

    return {
      ...this.toBaseResponse(result.sale, customer, result.receipt, result.period),
      items: result.createdItems.map((item) => ({
        ...this.toItemResponse(item),
        stockAfter: result.stockAfterByItem.get(item.itemId)!,
      })),
      authorizations: [],
    };
  }

  private toBaseResponse(
    sale: Sale,
    customer: { id: string; name: string } | null,
    receipt: Receipt | null,
    period?: FinancialPeriod,
  ): SaleResponseBase {
    const padding: number = this.config.get('SALES_NUMBER_PADDING', { infer: true });
    const resolvedPeriod: FinancialPeriod = period ?? {
      label: '',
      start: sale.periodStart,
      end: sale.periodEnd,
    };

    return {
      id: sale.id,
      number: sale.number.toString(),
      formattedNumber: formatSaleNumber(sale.number, padding),
      kind: sale.kind,
      status: sale.status,
      customer,
      total: sale.total.toFixed(2),
      paidAmount: sale.paidAmount.toFixed(2),
      balance: calculateBalance(sale.total, sale.paidAmount).toFixed(2),
      dueDate: sale.dueDate ? sale.dueDate.toISOString().slice(0, 10) : null,
      soldAt: sale.soldAt.toISOString(),
      period: {
        label: resolvedPeriod.label,
        start: resolvedPeriod.start.toISOString(),
        end: resolvedPeriod.end.toISOString(),
      },
      receipt: receipt ? this.receipts.toSummary(receipt) : null,
    };
  }

  private toItemResponse(item: SaleItem): SaleItemResponse {
    return {
      itemId: item.itemId,
      sku: item.itemSkuSnapshot,
      name: item.itemNameSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      total: item.total.toFixed(2),
    };
  }

  private buildListWhere(companyId: string, query: ListSalesQueryDto): Prisma.SaleWhereInput {
    const where: Prisma.SaleWhereInput = { companyId };

    if (query.customerId) where.customerId = query.customerId;
    if (query.status) where.status = query.status;
    if (query.kind) where.kind = query.kind;

    if (query.dateFrom || query.dateTo) {
      where.soldAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    if (query.dueFrom || query.dueTo) {
      where.dueDate = {
        ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
        ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
      };
    }

    if (query.overdue) where.status = 'OVERDUE';

    return where;
  }

  /** Mesmo comportamento de `InventoryService.ensurePeriodIsValid`. */
  private ensurePeriodIsValid(query: ListSalesQueryDto): void {
    if (query.dateFrom && query.dateTo && new Date(query.dateFrom) > new Date(query.dateTo)) {
      throw new BusinessException(
        BusinessErrorCode.VALIDACAO_FALHOU,
        'dateFrom não pode ser depois de dateTo',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (query.dueFrom && query.dueTo && new Date(query.dueFrom) > new Date(query.dueTo)) {
      throw new BusinessException(
        BusinessErrorCode.VALIDACAO_FALHOU,
        'dueFrom não pode ser depois de dueTo',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private consolidateQuantities(items: CreateSaleItemDto[]): Map<string, number> {
    const consolidated = new Map<string, number>();

    for (const line of items) {
      consolidated.set(line.itemId, (consolidated.get(line.itemId) ?? 0) + line.quantity);
    }

    return consolidated;
  }

  private ensureItemCountIsSane(count: number): void {
    const max: number = this.config.get('SALES_MAX_ITEMS_PER_SALE', { infer: true });

    if (count > max) {
      throw new BusinessException(
        BusinessErrorCode.VALIDACAO_FALHOU,
        `Número de itens acima do máximo permitido por venda (${String(max)})`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Trava as linhas dos itens NUM ÚNICO `SELECT ... FOR UPDATE`, ordenado
   * por `id` — não um por item em loop (docs/23#concorrência). A ordenação
   * é o que impede deadlock quando duas vendas tocam os mesmos itens em
   * ordem inversa.
   *
   * Query crua porque `FOR UPDATE` não existe na API do Prisma — e query
   * crua não passa pela Client Extension de tenant, então `company_id`
   * entra à mão. Exatamente como em `InventoryService.lockItem`.
   */
  private async lockItems(
    tx: Prisma.TransactionClient,
    companyId: string,
    itemIds: string[],
  ): Promise<LockedItemRow[]> {
    return tx.$queryRaw<LockedItemRow[]>`
      SELECT id, sku, name, price, stock, status
      FROM items
      WHERE id = ANY(${itemIds}::uuid[]) AND company_id = ${companyId}::uuid
      ORDER BY id
      FOR UPDATE
    `;
  }

  /**
   * RN-46: sequencial por empresa, emitido dentro da transação da venda,
   * mesmo padrão de advisory lock que `ReceiptsService.allocate` usa —
   * namespace PRÓPRIO (4272 ≠ 4271) para não serializar venda e
   * comprovante entre si sem necessidade (docs/19).
   */
  private async allocateSaleNumber(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<bigint> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(${SALE_NUMBERING_LOCK_NAMESPACE}, hashtext(${companyId}))
    `;

    const { _max } = await tx.sale.aggregate({ where: { companyId }, _max: { number: true } });

    return (_max.number ?? 0n) + 1n;
  }

  /**
   * docs/20#concorrência: serializa apenas a DECISÃO de crédito daquele
   * cliente, não a linha de `customers` — travar `customers` serializaria
   * também edições de cadastro, que não têm nada a ver com limite. O valor
   * a proteger não está em nenhuma linha (é uma soma sobre `sales`), então
   * não há linha "certa" para travar: é exatamente para isso que o
   * advisory lock existe. Liberado no commit/rollback automaticamente —
   * não há lock vazado se a requisição morrer.
   *
   * `hashtext(uuid)` pode colidir (32 bits); custa serialização
   * desnecessária entre dois clientes distintos, nunca correção.
   */
  private async lockCustomerCredit(
    tx: Prisma.TransactionClient,
    customerId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(${CUSTOMER_CREDIT_LOCK_NAMESPACE}, hashtext(${customerId}))
    `;
  }

  /** Cliente escopado por empresa — de outra empresa é 404, nunca 403 (docs/29). */
  private async findCustomerForCredit(
    tx: Prisma.TransactionClient,
    companyId: string,
    customerId: string,
  ): Promise<Customer> {
    const customer = await tx.customer.findFirst({ where: { id: customerId, companyId } });

    if (!customer) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Cliente não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    return customer;
  }

  /**
   * Omitido, aplica o prazo padrão DA EMPRESA (não o valor bruto do env —
   * `FINANCE_DEFAULT_DUE_DAYS` só define o default na criação da empresa;
   * dali em diante quem manda é `company_finance_settings.default_due_days`,
   * editável por `PUT /companies/me/finance-settings`) sobre `soldAt`.
   * Informado, recusa data no passado (docs/19: `VALIDACAO_FALHOU`) — "hoje"
   * é resolvido no fuso da empresa (docs/21, RN-61), nunca por comparação
   * crua de `timestamptz`.
   */
  private resolveDueDate(
    raw: string | undefined,
    soldAt: Date,
    settings: { defaultDueDays: number; timezone: string },
  ): Date {
    if (raw === undefined) {
      const today = resolveToday(soldAt, settings.timezone);
      return new Date(today.getTime() + settings.defaultDueDays * 86_400_000);
    }

    const dueDate = new Date(raw);
    const today = resolveToday(soldAt, settings.timezone);

    if (dueDate.getTime() < today.getTime()) {
      throw new BusinessException(
        BusinessErrorCode.VALIDACAO_FALHOU,
        'dueDate não pode estar no passado',
        HttpStatus.BAD_REQUEST,
      );
    }

    return dueDate;
  }

  /** docs/20#fórmula: soma de vendas a prazo não canceladas, dentro da janela do período. */
  private async sumUsedInPeriod(
    tx: Prisma.TransactionClient,
    companyId: string,
    customerId: string,
    period: FinancialPeriod,
  ): Promise<Prisma.Decimal> {
    const { _sum } = await tx.sale.aggregate({
      where: {
        companyId,
        customerId,
        kind: SaleKind.CREDIT,
        status: { not: SaleStatus.CANCELED },
        soldAt: { gte: period.start, lt: period.end },
      },
      _sum: { total: true },
    });

    return new Decimal(_sum.total ?? 0);
  }
}
