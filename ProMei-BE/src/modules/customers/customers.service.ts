import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  type Customer,
  type CustomerStatusEvent,
  CustomerStatus,
  CustomerStatusReason,
} from '../../generated/prisma/client';
import type { Env } from '../../shared/config';
import { BusinessErrorCode, BusinessException } from '../../shared/errors';
import { resolvePagination } from '../../shared/pagination';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FinanceSettingsService, periodForLabel, resolvePeriod } from '../finance';
import { exceedsLimit, parsePlanLimits, resolveMaxCustomers } from '../users/plan-limits';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import type { ListStatusEventsQueryDto } from './dto/list-status-events-query.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Linha da listagem (docs/28): o cadastro mais `pendingTotal`, o saldo em
 * aberto do cliente. É o dado que decide, na lista, quem pode comprar — por
 * isso viaja junto e não obriga a UI a pedir o resumo de cada linha.
 */
export type CustomerListItem = Customer & { pendingTotal: string };

export interface FinancialSummaryPeriod {
  label: string;
  start: string;
  end: string;
  used: string;
  available: string;
  availableClamped: string;
}

export interface FinancialSummaryLifetime {
  purchasedTotal: string;
  paidTotal: string;
  pendingTotal: string;
  overdueTotal: string;
  salesCount: number;
  openSalesCount: number;
}

export interface FinancialSummary {
  customerId: string;
  financialStatus: Customer['financialStatus'];
  blockedForCredit: boolean;
  creditLimit: string;
  period: FinancialSummaryPeriod;
  lifetime: FinancialSummaryLifetime;
}

/**
 * RN-32 tem dois desfechos possíveis, mesmo contrato de `DELETE /items/:id`:
 * cliente sem venda vinculada sai do banco, cliente com histórico apenas
 * muda de estado.
 */
export type CustomerRemovalOutcome = 'DELETED' | 'INACTIVATED';

export interface CustomerRemovalResult {
  id: string;
  outcome: CustomerRemovalOutcome;
}

const CUSTOMERS_RESOURCE = 'customers';
/** PD-16: recurso separado de `customers` — dar crédito não é editar cadastro. */
const CUSTOMER_CREDIT_RESOURCE = 'customer-credit';

/** Violação do índice único parcial `(company_id, document)` — RN-31. */
const UNIQUE_VIOLATION_PRISMA_CODE = 'P2002';

/** PD-17: nome fixo do cadastro anonimizado (docs/18, docs/29). */
const ANONYMIZED_NAME = 'Cliente removido';

/** Dinheiro sempre com duas casas no contrato de `financial-summary` (docs/28). */
function formatMoney(value: number): string {
  return value.toFixed(2);
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
    private readonly financeSettings: FinanceSettingsService,
  ) {}

  /**
   * RN-31: documento, quando informado, é único por empresa — nunca globalmente.
   * RN-14/PD-08: `plans.limits.maxCustomers` — exceder bloqueia novo cadastro,
   * não apaga quem já existe.
   */
  async create(
    companyId: string,
    dto: CreateCustomerDto,
    actorId?: string,
    ip?: string,
  ): Promise<Customer> {
    await this.ensurePlanLimit(companyId);

    if (dto.document) {
      await this.ensureDocumentAvailable(companyId, dto.document);
    }

    const defaultCreditLimit: number = this.config.get('FINANCE_DEFAULT_CREDIT_LIMIT', {
      infer: true,
    });

    let customer: Customer;
    try {
      customer = await this.prisma.db.customer.create({
        data: {
          companyId,
          name: dto.name,
          creditLimit: defaultCreditLimit,
          ...(dto.document !== undefined ? { document: dto.document } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.address !== undefined ? { address: dto.address as Prisma.InputJsonValue } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });
    } catch (error) {
      // Perdeu a corrida para outro cadastro com o mesmo documento: o índice
      // único decide, e a mensagem para o cliente é a mesma da checagem prévia.
      if (dto.document && this.isPrismaError(error, UNIQUE_VIOLATION_PRISMA_CODE)) {
        throw this.documentConflict(dto.document);
      }
      throw error;
    }

    await this.audit.log({
      action: 'customer.created',
      resource: CUSTOMERS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { customerId: customer.id, name: customer.name, document: customer.document },
      ip,
    });

    return customer;
  }

  /**
   * Cada linha traz `financialStatus`, `creditLimit` e `pendingTotal`
   * (docs/28): a listagem existe para decidir no balcão quem pode comprar, e
   * "quanto essa pessoa deve" é metade dessa decisão. Sem o campo aqui, a UI
   * precisaria pedir o `financial-summary` de cada linha — N+1 de rede.
   *
   * `pendingTotal` é `"0.00"` para todo mundo HOJE: `sales` só chega no épico
   * 10 e não há saldo nenhum a somar. Não é placeholder — é o valor correto
   * do sistema neste ponto da fase 2, e o contrato já nasce estável. Quando
   * `sales` existir, entra aqui a agregação por cliente
   * (`SUM(total - paid_amount)` dos status em aberto) em UMA consulta
   * agrupada pelos ids da página, nunca uma consulta por linha.
   */
  async findAll(
    companyId: string,
    query: ListCustomersQueryDto,
  ): Promise<PaginatedResult<CustomerListItem>> {
    const { page, limit, skip } = resolvePagination(this.config, query.page, query.limit);
    const where = this.buildListWhere(companyId, query);

    const [data, total] = await Promise.all([
      this.prisma.db.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.customer.count({ where }),
    ]);

    return {
      data: data.map((customer) => ({ ...customer, pendingTotal: formatMoney(0) })),
      total,
      page,
      limit,
    };
  }

  /**
   * Escopado por `companyId` explicitamente: cliente de outra empresa não
   * existe do ponto de vista desta consulta, então o desfecho é sempre 404 —
   * nunca 403. 403 confirmaria que o recurso existe, e isso já é informação
   * (mesmo tratamento de `/items/:id`).
   */
  async findOne(id: string, companyId: string): Promise<Customer> {
    const customer = await this.prisma.db.customer.findFirst({ where: { id, companyId } });

    if (!customer) {
      throw new BusinessException(
        BusinessErrorCode.CLIENTE_NAO_ENCONTRADO,
        'Cliente não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    return customer;
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateCustomerDto,
    actorId?: string,
    ip?: string,
  ): Promise<Customer> {
    const existing = await this.findOne(id, companyId);

    if (dto.document && dto.document !== existing.document) {
      await this.ensureDocumentAvailable(companyId, dto.document);
    }

    let customer: Customer;
    try {
      customer = await this.prisma.db.customer.update({
        where: { id },
        data: { ...dto, address: dto.address as Prisma.InputJsonValue | undefined },
      });
    } catch (error) {
      if (dto.document && this.isPrismaError(error, UNIQUE_VIOLATION_PRISMA_CODE)) {
        throw this.documentConflict(dto.document);
      }
      throw error;
    }

    await this.audit.log({
      action: 'customer.updated',
      resource: CUSTOMERS_RESOURCE,
      userId: actorId,
      companyId,
      // `address` fica de fora do diff: é JSON livre (não garantidamente
      // serializável pro `Json` do Prisma) e o auditor já sabe, pelo timestamp,
      // que mudou — o valor em si não é o que a trilha precisa provar aqui.
      diff: {
        customerId: id,
        name: dto.name,
        document: dto.document,
        email: dto.email,
        phone: dto.phone,
        notes: dto.notes,
        addressChanged: dto.address !== undefined,
      },
      ip,
    });

    return customer;
  }

  /** Máquina de estados do cliente (RN-33): ativo ⇄ inativo. */
  async updateStatus(
    id: string,
    companyId: string,
    status: CustomerStatus,
    actorId?: string,
    ip?: string,
  ): Promise<Customer> {
    const existing = await this.findOne(id, companyId);

    if (existing.status === status) return existing;

    // Reativar volta a ocupar vaga no plano (RN-14), mesmo padrão de ItemsService.
    if (status === CustomerStatus.ACTIVE) {
      await this.ensurePlanLimit(companyId);
    }

    const customer = await this.prisma.db.customer.update({ where: { id }, data: { status } });

    await this.audit.log({
      action: status === CustomerStatus.ACTIVE ? 'customer.activated' : 'customer.deactivated',
      resource: CUSTOMERS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { customerId: id, from: existing.status, to: status },
      ip,
    });

    return customer;
  }

  /**
   * PD-16: recurso `customer-credit`, permissão própria (`customer-credit:update`),
   * separado de `customers:update`. Editar telefone e dar R$ 5.000 de crédito
   * não podem depender da mesma permissão.
   *
   * A alteração vale A PARTIR DE AGORA e nunca retroage (RN-35): o utilizado
   * do período corrente não muda — só a régua contra a qual ele é comparado.
   * Baixar o limite abaixo do já utilizado é permitido de propósito: é a
   * forma de "fechar a torneira" sem apagar histórico, e o disponível
   * simplesmente fica negativo (docs/18).
   *
   * Não existe tabela de histórico de limite — `audit_logs` já é a fonte de
   * verdade dessa pergunta (RNF-06); uma segunda cópia abriria divergência.
   */
  async updateCreditLimit(
    id: string,
    companyId: string,
    creditLimit: number,
    actorId?: string,
    ip?: string,
    reason?: string,
  ): Promise<Customer> {
    const existing = await this.findOne(id, companyId);

    const maxCreditLimit: number = this.config.get('FINANCE_MAX_CREDIT_LIMIT', { infer: true });
    if (creditLimit > maxCreditLimit) {
      throw new BusinessException(
        BusinessErrorCode.LIMITE_INVALIDO,
        `creditLimit não pode exceder ${String(maxCreditLimit)}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const customer = await this.prisma.db.customer.update({
      where: { id },
      data: { creditLimit },
    });

    await this.audit.log({
      action: 'customer.credit_limit_updated',
      resource: CUSTOMER_CREDIT_RESOURCE,
      userId: actorId,
      companyId,
      diff: {
        customerId: id,
        from: existing.creditLimit.toString(),
        to: customer.creditLimit.toString(),
        ...(reason !== undefined ? { reason } : {}),
      },
      ip,
    });

    return customer;
  }

  /**
   * PD-16: mesmo recurso/permissão de `updateCreditLimit`, mesmo motivo de separação.
   *
   * Gera uma linha em `customer_status_events` com `reason = MANUAL`
   * (docs/28). O bloqueio manual não muda a situação financeira derivada — o
   * cliente pode estar `REGULAR` e mesmo assim ser bloqueado no balcão — então
   * `fromStatus` e `toStatus` são o mesmo valor de propósito, e o que
   * aconteceu de fato fica no `context`. É o único jeito de responder "desde
   * quando esse cliente está bloqueado, e quem bloqueou" sem varrer
   * `audit_logs`, que é trilha genérica e não sabe responder por cliente.
   *
   * Evento e cadastro vão na MESMA transação: um bloqueio sem evento deixaria
   * o histórico mentindo, e um evento sem bloqueio, pior ainda.
   */
  async updateCreditBlock(
    id: string,
    companyId: string,
    blockedForCredit: boolean,
    actorId?: string,
    ip?: string,
    reason?: string,
  ): Promise<Customer> {
    const existing = await this.findOne(id, companyId);

    if (existing.blockedForCredit === blockedForCredit) return existing;

    const customer = await this.prisma.withTenantSession(async (tx) => {
      const updated = await tx.customer.update({
        where: { id },
        data: { blockedForCredit },
      });

      await tx.customerStatusEvent.create({
        data: {
          companyId,
          customerId: id,
          fromStatus: existing.financialStatus,
          toStatus: updated.financialStatus,
          reason: CustomerStatusReason.MANUAL,
          ...(actorId ? { userId: actorId } : {}),
          context: {
            blockedForCredit,
            previousBlockedForCredit: existing.blockedForCredit,
            ...(reason !== undefined ? { reason } : {}),
          },
        },
      });

      return updated;
    });

    await this.audit.log({
      action: blockedForCredit ? 'customer.credit_blocked' : 'customer.credit_unblocked',
      resource: CUSTOMER_CREDIT_RESOURCE,
      userId: actorId,
      companyId,
      diff: {
        customerId: id,
        from: existing.blockedForCredit,
        to: blockedForCredit,
        ...(reason !== undefined ? { reason } : {}),
      },
      ip,
    });

    return customer;
  }

  /**
   * RN-32: cliente com venda vinculada nunca é excluído — vira inativo. Só
   * cliente sem nenhuma venda sai do banco de fato.
   *
   * A tabela `sales` ainda não existe (chega no épico 10): até lá, nenhum
   * cliente PODE ter venda, então o desfecho é sempre `DELETED` — não é uma
   * checagem pulada, é a verdade do sistema hoje. O contrato `{ id, outcome }`
   * já nasce estável (mesmo formato de `DELETE /items/:id`); quando `sales`
   * existir, só a lógica interna ganha a contagem — a resposta não muda de
   * formato.
   */
  async remove(
    id: string,
    companyId: string,
    actorId?: string,
    ip?: string,
  ): Promise<CustomerRemovalResult> {
    await this.findOne(id, companyId);

    await this.prisma.db.customer.delete({ where: { id } });

    await this.audit.log({
      action: 'customer.deleted',
      resource: CUSTOMERS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { customerId: id },
      ip,
    });

    return { id, outcome: 'DELETED' };
  }

  /**
   * `POST /customers/:id/anonymize` — exclusão a pedido do titular (LGPD,
   * PD-17, RN-38). Distinto de `remove()`: aqui a intenção não é "não há
   * mais uso para este cadastro", é "o titular pediu para ser esquecido" —
   * por isso NUNCA é exclusão física, mesmo quando o cliente não tem venda
   * nenhuma.
   *
   * `name` vira "Cliente removido"; `document`/`email`/`phone`/`address`
   * viram `NULL`; `anonymizedAt` é preenchido; o cliente passa a `INACTIVE`
   * e não aceita venda nova (RN-33 cuida disso sozinha, sem código extra
   * aqui). Vendas, pagamentos e movimentações PERMANECEM — a base legal para
   * reter o registro comercial é distinta da que sustentava o cadastro.
   *
   * `notes` não é limpo: nenhum doc pede isso, e apagar mais do que o
   * combinado é tão errado quanto apagar de menos numa operação de LGPD.
   *
   * ⚠️ PD-17: a redação final e a base legal exata precisam de validação
   * jurídica antes do go-live — isso não bloqueia o código, mas é o motivo
   * de este método não inventar nenhum texto além do que os docs já fixam.
   *
   * Idempotente: cliente já anonimizado simplesmente devolve o estado atual,
   * sem novo evento de auditoria — "anonimizar de novo" não é uma ação nova.
   */
  async anonymize(id: string, companyId: string, actorId?: string, ip?: string): Promise<Customer> {
    const existing = await this.findOne(id, companyId);

    if (existing.anonymizedAt) return existing;

    const customer = await this.prisma.db.customer.update({
      where: { id },
      data: {
        name: ANONYMIZED_NAME,
        document: null,
        email: null,
        phone: null,
        address: Prisma.DbNull,
        status: CustomerStatus.INACTIVE,
        anonymizedAt: new Date(),
      },
    });

    await this.audit.log({
      action: 'customer.anonymized',
      resource: CUSTOMERS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { customerId: id },
      ip,
    });

    return customer;
  }

  /**
   * `GET /customers/:id/financial-summary` (docs/18).
   *
   * O contrato separa `period` (limite, utilizado, disponível, janela
   * declarada) de `lifetime` (comprado, pago, pendente, em atraso) — é
   * contratual, não estético: limite é régua mensal, dívida não zera na
   * virada, e misturar as duas escalas sem rótulo é a origem clássica de "o
   * sistema disse que eu podia comprar".
   *
   * `available` sai real (pode ficar negativo depois de uma liberação
   * administrativa) e `availableClamped` nunca fica abaixo de zero (PD-03) —
   * o back-end não destrói informação, quem escolhe é a UI.
   *
   * `sales` ainda não existe (chega no épico 10): `used` e todo o `lifetime`
   * são zero HOJE porque não há venda nenhuma para agregar — não é uma
   * checagem pulada, é a verdade do sistema neste ponto da fase 2. `period`
   * já é a janela real, calculada com a configuração financeira de verdade
   * da empresa, para a UI já poder mostrar a régua antes de haver venda.
   */
  async getFinancialSummary(
    id: string,
    companyId: string,
    periodLabel?: string,
  ): Promise<FinancialSummary> {
    const customer = await this.findOne(id, companyId);
    const settings = await this.financeSettings.getMySettings(companyId);

    const period = periodLabel
      ? periodForLabel(periodLabel, settings.closingDay, settings.timezone)
      : resolvePeriod(new Date(), settings.closingDay, settings.timezone);

    const creditLimit = customer.creditLimit.toNumber();
    // `usedInPeriod` fica 0 até `sales` existir — ver o porquê no doc-comment acima.
    const usedInPeriod = 0;
    const available = creditLimit - usedInPeriod;
    const availableClamped = Math.max(available, 0);

    return {
      customerId: id,
      financialStatus: customer.financialStatus,
      blockedForCredit: customer.blockedForCredit,
      creditLimit: formatMoney(creditLimit),
      period: {
        label: period.label,
        start: period.start.toISOString(),
        end: period.end.toISOString(),
        used: formatMoney(usedInPeriod),
        available: formatMoney(available),
        availableClamped: formatMoney(availableClamped),
      },
      lifetime: {
        purchasedTotal: formatMoney(0),
        paidTotal: formatMoney(0),
        pendingTotal: formatMoney(0),
        overdueTotal: formatMoney(0),
        salesCount: 0,
        openSalesCount: 0,
      },
    };
  }

  /**
   * `GET /customers/:id/status-events` (docs/18): histórico append-only de
   * situação financeira, paginado. Hoje o único evento possível é o do
   * bloqueio manual de crédito (`reason = MANUAL`, ver `updateCreditBlock`);
   * as transições derivadas (venda a prazo, recebimento, job de atraso —
   * docs/21) chegam nos épicos 10/11/13 e escrevem na mesma tabela.
   */
  async getStatusEvents(
    id: string,
    companyId: string,
    query: ListStatusEventsQueryDto,
  ): Promise<PaginatedResult<CustomerStatusEvent>> {
    await this.findOne(id, companyId); // 404 (nunca 403) se o cliente não é desta empresa

    const { page, limit, skip } = resolvePagination(this.config, query.page, query.limit);
    const where: Prisma.CustomerStatusEventWhereInput = { companyId, customerId: id };

    const [data, total] = await Promise.all([
      this.prisma.db.customerStatusEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.customerStatusEvent.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  private buildListWhere(
    companyId: string,
    query: ListCustomersQueryDto,
  ): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = { companyId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.financialStatus) {
      where.financialStatus = query.financialStatus;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { document: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async ensureDocumentAvailable(companyId: string, document: string): Promise<void> {
    const existing = await this.prisma.db.customer.findFirst({
      where: { companyId, document },
      select: { id: true },
    });

    if (existing) throw this.documentConflict(document);
  }

  private documentConflict(document: string): BusinessException {
    return new BusinessException(
      BusinessErrorCode.DOCUMENTO_JA_CADASTRADO,
      `Já existe um cliente com o documento ${document} nesta empresa`,
      HttpStatus.CONFLICT,
    );
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }

  /**
   * RN-14/PD-08: `plans.limits.maxCustomers`, validado na criação e na
   * reativação — mesmo padrão de `ItemsService.ensurePlanLimit`.
   *
   * Diferente de `maxItems`/`maxUsers`: ausência de `maxCustomers` no plano
   * NÃO significa "sem teto" — cai no default de `PLAN_DEFAULT_MAX_CUSTOMERS`
   * (docs/27). Sem assinatura, nenhum teto é aplicado aqui — é
   * responsabilidade da tabela de decisão de acesso, não desta checagem.
   */
  private async ensurePlanLimit(companyId: string): Promise<void> {
    const subscription = (await this.prisma.db.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    })) as { plan: { limits: unknown; name: string } } | null;

    if (!subscription) return;

    const defaultMaxCustomers: number = this.config.get('PLAN_DEFAULT_MAX_CUSTOMERS', {
      infer: true,
    });
    const maxCustomers = resolveMaxCustomers(
      parsePlanLimits(subscription.plan.limits),
      defaultMaxCustomers,
    );
    const activeCount = await this.prisma.db.customer.count({
      where: { companyId, status: CustomerStatus.ACTIVE },
    });

    if (exceedsLimit(activeCount, maxCustomers)) {
      throw new BusinessException(
        BusinessErrorCode.LIMITE_PLANO_EXCEDIDO,
        `O plano ${subscription.plan.name} permite ${String(maxCustomers)} clientes ativos`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
