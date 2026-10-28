import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ItemStatus, Prisma, type Item } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BusinessErrorCode, BusinessException } from '../../shared/errors';
import type { Env } from '../../shared/config';
import { resolvePagination } from '../../shared/pagination';
import { AuditService } from '../audit/audit.service';
import { exceedsLimit, parsePlanLimits } from '../users/plan-limits';
import { buildSku, parseSkuSequence } from './sku';
import type { CreateItemDto } from './dto/create-item.dto';
import type { UpdateItemDto } from './dto/update-item.dto';
import type { ListItemsQueryDto } from './dto/list-items-query.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** RF-35: `stock < minStock` computado na resposta — não é coluna no banco. */
export interface ItemWithAlert extends Item {
  belowMinStock: boolean;
}

/**
 * RN-23 tem dois desfechos possíveis e o cliente precisa saber qual aconteceu:
 * item sem histórico sai do banco, item com histórico apenas muda de estado.
 */
export type ItemRemovalOutcome = 'DELETED' | 'INACTIVATED';

export interface ItemRemovalResult {
  id: string;
  outcome: ItemRemovalOutcome;
}

const ITEMS_RESOURCE = 'items';

/** Violação do índice único `(company_id, sku)` — RN-20. */
const UNIQUE_VIOLATION_PRISMA_CODE = 'P2002';

/** FK `stock_movements.item_id` com `onDelete: Restrict` — RN-23 no nível do banco. */
const FK_RESTRICT_PRISMA_CODE = 'P2003';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
  ) {}

  /**
   * RN-25: nome/unidade/preço vêm validados do DTO; SKU é gerado quando ausente.
   * RN-20: SKU informado é conferido antes; o índice único é a garantia final.
   */
  async create(
    companyId: string,
    dto: CreateItemDto,
    actorId?: string,
    ip?: string,
  ): Promise<Item> {
    await this.ensurePlanLimit(companyId);

    const item = dto.sku
      ? await this.createWithGivenSku(companyId, dto, dto.sku)
      : await this.createWithGeneratedSku(companyId, dto);

    await this.audit.log({
      action: 'item.created',
      resource: ITEMS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { itemId: item.id, sku: item.sku, name: item.name },
      ip,
    });

    return item;
  }

  /** RF-31: busca textual, filtro por categoria/status e paginação. */
  async findAll(
    companyId: string,
    query: ListItemsQueryDto,
  ): Promise<PaginatedResult<ItemWithAlert>> {
    const { page, limit, skip } = resolvePagination(this.config, query.page, query.limit);
    const where = this.buildListWhere(companyId, query);

    const [data, total] = await Promise.all([
      this.prisma.db.item.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.item.count({ where }),
    ]);

    return { data: data.map((item) => this.withAlert(item)), total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<ItemWithAlert> {
    const item = await this.prisma.db.item.findFirst({ where: { id, companyId } });

    if (!item) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Item não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.withAlert(item);
  }

  /** RF-35: alerta visual de estoque abaixo do mínimo. */
  private withAlert(item: Item): ItemWithAlert {
    return { ...item, belowMinStock: item.stock < item.minStock };
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateItemDto,
    actorId?: string,
    ip?: string,
  ): Promise<Item> {
    const existing = await this.findOne(id, companyId);

    if (dto.sku && dto.sku !== existing.sku) {
      await this.ensureSkuAvailable(companyId, dto.sku);
    }

    const item = await this.prisma.db.item.update({ where: { id }, data: dto });

    await this.audit.log({
      action: 'item.updated',
      resource: ITEMS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { itemId: id, ...dto },
      ip,
    });

    return item;
  }

  /** Máquina de estados do item (docs/04): ativo ⇄ inativo. */
  async updateStatus(
    id: string,
    companyId: string,
    status: ItemStatus,
    actorId?: string,
    ip?: string,
  ): Promise<Item> {
    const existing = await this.findOne(id, companyId);

    if (existing.status === status) return existing;

    // Reativar volta a ocupar vaga no plano (RN-14).
    if (status === ItemStatus.ACTIVE) {
      await this.ensurePlanLimit(companyId);
    }

    const item = await this.prisma.db.item.update({ where: { id }, data: { status } });

    await this.audit.log({
      action: status === ItemStatus.ACTIVE ? 'item.activated' : 'item.deactivated',
      resource: ITEMS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { itemId: id, from: existing.status, to: status },
      ip,
    });

    return item;
  }

  /**
   * RN-23: item com movimentação **nunca** é excluído — vira inativo. Só item
   * sem nenhum histórico sai do banco de fato.
   *
   * A contagem não é a única defesa: entre contar e excluir cabe uma
   * movimentação nova, e nesse caso o `onDelete: Restrict` da FK derruba o
   * DELETE. O erro é tratado como "tem histórico" e o item é inativado — o
   * mesmo desfecho que a contagem teria dado sem a corrida.
   */
  async remove(
    id: string,
    companyId: string,
    actorId?: string,
    ip?: string,
  ): Promise<ItemRemovalResult> {
    await this.findOne(id, companyId);

    const movements = await this.prisma.db.stockMovement.count({ where: { itemId: id } });

    if (movements > 0) {
      await this.updateStatus(id, companyId, ItemStatus.INACTIVE, actorId, ip);
      return { id, outcome: 'INACTIVATED' };
    }

    try {
      await this.prisma.db.item.delete({ where: { id } });
    } catch (error) {
      if (this.isPrismaError(error, FK_RESTRICT_PRISMA_CODE)) {
        await this.updateStatus(id, companyId, ItemStatus.INACTIVE, actorId, ip);
        return { id, outcome: 'INACTIVATED' };
      }
      throw error;
    }

    await this.audit.log({
      action: 'item.deleted',
      resource: ITEMS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { itemId: id },
      ip,
    });

    return { id, outcome: 'DELETED' };
  }

  private buildListWhere(companyId: string, query: ListItemsQueryDto): Prisma.ItemWhereInput {
    const where: Prisma.ItemWhereInput = { companyId };

    if (query.category) {
      where.category = query.category;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async createWithGivenSku(
    companyId: string,
    dto: CreateItemDto,
    sku: string,
  ): Promise<Item> {
    await this.ensureSkuAvailable(companyId, sku);

    try {
      return await this.prisma.db.item.create({ data: this.toCreateData(companyId, dto, sku) });
    } catch (error) {
      // Perdeu a corrida para outra criação com o mesmo SKU: o índice único
      // decide, e a mensagem para o cliente é a mesma da checagem prévia.
      if (this.isPrismaError(error, UNIQUE_VIOLATION_PRISMA_CODE)) {
        throw this.skuConflict(sku);
      }
      throw error;
    }
  }

  /**
   * RN-25: gera `<prefixo>-<sequencial>` a partir do maior sequencial já usado
   * pela empresa. Duas criações simultâneas chegam ao mesmo número; a que
   * perder o índice único tenta o próximo, até esgotar as tentativas.
   */
  private async createWithGeneratedSku(companyId: string, dto: CreateItemDto): Promise<Item> {
    const prefix: string = this.config.get('ITEM_SKU_PREFIX', { infer: true });
    const padding: number = this.config.get('ITEM_SKU_SEQUENCE_PADDING', { infer: true });
    const maxAttempts: number = this.config.get('ITEM_SKU_MAX_ATTEMPTS', { infer: true });

    let sequence = await this.nextSkuSequence(companyId, prefix);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const sku = buildSku(prefix, sequence, padding);

      try {
        return await this.prisma.db.item.create({ data: this.toCreateData(companyId, dto, sku) });
      } catch (error) {
        if (!this.isPrismaError(error, UNIQUE_VIOLATION_PRISMA_CODE)) throw error;
        sequence += 1;
      }
    }

    throw new BusinessException(
      BusinessErrorCode.SKU_NAO_GERADO,
      `Não foi possível gerar um SKU único após ${String(maxAttempts)} tentativas`,
      HttpStatus.CONFLICT,
    );
  }

  /**
   * Maior sequencial já emitido para a empresa.
   *
   * `orderBy: sku desc` só devolve o maior número porque o padding mantém todos
   * os sufixos do mesmo tamanho (ver `sku.ts`). SKU digitado à mão que não siga
   * o formato não entra na conta — `parseSkuSequence` devolve `null` e a
   * sequência recomeça do 1, que o índice único então rejeita se já existir.
   */
  private async nextSkuSequence(companyId: string, prefix: string): Promise<number> {
    const last = await this.prisma.db.item.findFirst({
      where: { companyId, sku: { startsWith: `${prefix}-` } },
      orderBy: { sku: 'desc' },
      select: { sku: true },
    });

    return (last ? (parseSkuSequence(last.sku, prefix) ?? 0) : 0) + 1;
  }

  private toCreateData(
    companyId: string,
    dto: CreateItemDto,
    sku: string,
  ): Prisma.ItemUncheckedCreateInput {
    return {
      companyId,
      sku,
      name: dto.name,
      unit: dto.unit,
      price: dto.price,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.minStock !== undefined ? { minStock: dto.minStock } : {}),
    };
  }

  /** RN-20: SKU é único por empresa, não globalmente. */
  private async ensureSkuAvailable(companyId: string, sku: string): Promise<void> {
    const existing = await this.prisma.db.item.findFirst({
      where: { companyId, sku },
      select: { id: true },
    });

    if (existing) throw this.skuConflict(sku);
  }

  private skuConflict(sku: string): BusinessException {
    return new BusinessException(
      BusinessErrorCode.SKU_JA_EXISTE,
      `Já existe um item com o SKU ${sku} nesta empresa`,
      HttpStatus.CONFLICT,
    );
  }

  /** RN-14: o limite de itens do plano é validado na criação e na reativação. */
  private async ensurePlanLimit(companyId: string): Promise<void> {
    const subscription = (await this.prisma.db.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    })) as { plan: { limits: unknown; name: string } } | null;

    // Sem assinatura não há limite a aplicar — bloquear escrita nesse caso é
    // responsabilidade da tabela de decisão de acesso, não daqui.
    if (!subscription) return;

    const { maxItems } = parsePlanLimits(subscription.plan.limits);
    const activeCount = await this.prisma.db.item.count({
      where: { companyId, status: ItemStatus.ACTIVE },
    });

    if (exceedsLimit(activeCount, maxItems)) {
      throw new BusinessException(
        BusinessErrorCode.LIMITE_PLANO_EXCEDIDO,
        `O plano ${subscription.plan.name} permite ${String(maxItems)} itens ativos`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }
}
