import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ItemStatus,
  Prisma,
  StockMovementType,
  type StockMovement,
} from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BusinessErrorCode, BusinessException } from '../../shared/errors';
import type { Env } from '../../shared/config';
import { resolvePagination } from '../../shared/pagination';
import { applyLockTimeout, translateConcurrencyError } from '../../shared/concurrency';
import { AuditService } from '../audit/audit.service';
import { ReceiptsService, type ReceiptSummary } from '../receipts';
import { acceptsNegativeQuantity, resolveStockDelta } from './stock-delta';
import type { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import type { ListStockMovementsQueryDto } from './dto/list-stock-movements-query.dto';

/** Saldo do item **depois** da movimentação — o cliente não precisa reconsultar. */
export interface MovementItemSnapshot {
  id: string;
  sku: string;
  name: string;
  stock: number;
}

export interface StockMovementResult {
  movement: StockMovement;
  item: MovementItemSnapshot;
  /**
   * Só saída tem comprovante (RF-33). Vem `PENDING` na resposta: o número já
   * vale, o PDF chega logo depois — e o link de download não depende dele.
   */
  receipt: ReceiptSummary | null;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** RF-34: linha do histórico, com item e autor resolvidos — sem N+1 no cliente. */
export interface StockMovementHistoryEntry {
  id: string;
  type: StockMovementType;
  quantity: number;
  reason: string | null;
  createdAt: Date;
  item: { id: string; sku: string; name: string };
  user: { id: string; email: string };
  /**
   * Comprovante da saída (RF-33). `null` em entrada e ajuste, que não geram um.
   *
   * Vem junto do histórico em vez de uma busca por linha: a tela lista saídas e
   * oferece o PDF de cada uma, então resolver isso no cliente seria um N+1 —
   * uma requisição por linha da página. Aqui o custo é um join numa FK única.
   */
  receipt: ReceiptSummary | null;
}

/** Linha travada pelo `SELECT ... FOR UPDATE`. */
interface LockedItemRow {
  id: string;
  sku: string;
  name: string;
  stock: number;
  status: ItemStatus;
}

const STOCK_MOVEMENTS_RESOURCE = 'stock-movements';

/** Mensagem de negócio do 409 — extraída para `shared/concurrency` (docs/19#concorrência). */
const LOCK_TIMEOUT_MESSAGE = 'Outra movimentação deste item está em andamento. Tente novamente.';

/**
 * Movimentações de estoque (RF-32): entrada, saída e ajuste.
 *
 * O saldo do item é **derivado** — só muda aqui, junto da movimentação que o
 * explica, dentro da mesma transação. Isso é o que sustenta RN-22: o histórico é
 * append-only e o saldo é sempre reconstituível a partir dele.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
    private readonly receipts: ReceiptsService,
  ) {}

  /**
   * RN-21: estoque nunca fica negativo, nem com duas saídas simultâneas.
   *
   * A garantia é o `SELECT ... FOR UPDATE` no começo da transação: a segunda
   * saída fica bloqueada até a primeira comitar e só então lê o saldo — já
   * descontado. Sem o lock, as duas leriam 10, cada uma gravaria 10-8=2 e o item
   * teria entregue 16 unidades tendo 10.
   *
   * Ler-verificar-gravar em transação **sem** lock não resolveria: em READ
   * COMMITTED as duas leituras enxergariam o mesmo saldo antigo. Um
   * `UPDATE ... SET stock = stock - x WHERE stock >= x` resolveria a corrida, mas
   * devolve "0 linhas afetadas" em vez do saldo que faltou — e a mensagem de erro
   * de RN-21 precisa dizer quanto havia.
   */
  async createMovement(
    companyId: string,
    userId: string,
    dto: CreateStockMovementDto,
    ip?: string,
  ): Promise<StockMovementResult> {
    this.ensureQuantityIsSane(dto);

    const result = await this.prisma
      .withTenantSession(
        async (tx) => {
          await applyLockTimeout(tx, this.config.get('INVENTORY_LOCK_TIMEOUT_MS', { infer: true }));

          const item = await this.lockItem(tx, companyId, dto.itemId);
          this.ensureItemAcceptsMovement(item, dto.type);

          const stock = item.stock + resolveStockDelta(dto.type, dto.quantity);

          if (stock < 0) {
            throw new BusinessException(
              BusinessErrorCode.ESTOQUE_INSUFICIENTE,
              `Saldo insuficiente para ${item.sku}: disponível ${String(item.stock)}, solicitado ${String(dto.quantity)}`,
            );
          }

          // RF-33: só saída gera comprovante. O número é emitido aqui dentro,
          // junto do fato que ele documenta — o PDF é que fica para depois.
          const receipt =
            dto.type === StockMovementType.OUT ? await this.receipts.allocate(tx, companyId) : null;

          const movement = await tx.stockMovement.create({
            data: {
              companyId,
              itemId: item.id,
              userId,
              type: dto.type,
              quantity: dto.quantity,
              reason: dto.reason,
              ...(receipt ? { receiptId: receipt.id } : {}),
            },
          });

          await tx.item.update({ where: { id: item.id }, data: { stock } });

          return {
            movement,
            item: { id: item.id, sku: item.sku, name: item.name, stock },
            receipt,
          };
        },
        {
          // O teto da transação precisa ser maior que o do lock, senão o Prisma
          // aborta antes de o Postgres devolver 55P03 e o motivo real some.
          timeout: this.config.get('INVENTORY_TRANSACTION_TIMEOUT_MS', { infer: true }),
          maxWait: this.config.get('INVENTORY_LOCK_TIMEOUT_MS', { infer: true }),
        },
      )
      .catch((error: unknown) => {
        throw translateConcurrencyError(error, LOCK_TIMEOUT_MESSAGE);
      });

    // Auditoria fica FORA da transação de propósito: ela registra o que
    // aconteceu, e um erro ao auditar não pode desfazer a movimentação.
    await this.audit.log({
      action: 'stock-movement.created',
      resource: STOCK_MOVEMENTS_RESOURCE,
      userId,
      companyId,
      diff: {
        movementId: result.movement.id,
        itemId: result.item.id,
        type: dto.type,
        quantity: dto.quantity,
        stockAfter: result.item.stock,
        ...(result.receipt ? { receiptNumber: result.receipt.number.toString() } : {}),
      },
      ip,
    });

    // Depois do commit e sem await: o PDF é derivado do banco, e falhar nele não
    // pode desfazer nem atrasar a saída que já aconteceu (docs/06). O comprovante
    // fica pendente e regenerável.
    if (result.receipt) {
      this.receipts.schedulePdfGeneration(result.receipt.id, companyId);
    }

    return {
      movement: result.movement,
      item: result.item,
      receipt: result.receipt ? this.receipts.toSummary(result.receipt) : null,
    };
  }

  /** RF-34: histórico de movimentações, filtrável por item e por período. */
  async findAll(
    companyId: string,
    query: ListStockMovementsQueryDto,
  ): Promise<PaginatedResult<StockMovementHistoryEntry>> {
    this.ensurePeriodIsValid(query);

    const { page, limit, skip } = resolvePagination(this.config, query.page, query.limit);
    const where = this.buildHistoryWhere(companyId, query);

    const [rows, total] = await Promise.all([
      this.prisma.db.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          quantity: true,
          reason: true,
          createdAt: true,
          item: { select: { id: true, sku: true, name: true } },
          user: { select: { id: true, email: true } },
          // Só os campos que o resumo usa. `number` é BIGINT: quem o converte
          // para string (e aplica o padding da RN-24) é o `toSummary`, não a
          // serialização — BigInt cru quebraria o JSON.
          receipt: { select: { id: true, number: true, pdfUrl: true, createdAt: true } },
        },
      }),
      this.prisma.db.stockMovement.count({ where }),
    ]);

    const data = rows.map((row) => ({
      ...row,
      receipt: row.receipt ? this.receipts.toSummary(row.receipt) : null,
    }));

    return { data, total, page, limit };
  }

  private buildHistoryWhere(
    companyId: string,
    query: ListStockMovementsQueryDto,
  ): Prisma.StockMovementWhereInput {
    const where: Prisma.StockMovementWhereInput = { companyId };

    if (query.itemId) {
      where.itemId = query.itemId;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    return where;
  }

  /** `dateFrom` depois de `dateTo` não tem resultado possível — é erro do cliente, não busca vazia. */
  private ensurePeriodIsValid(query: ListStockMovementsQueryDto): void {
    if (!query.dateFrom || !query.dateTo) return;

    if (new Date(query.dateFrom) > new Date(query.dateTo)) {
      throw new BusinessException(
        BusinessErrorCode.VALIDACAO_FALHOU,
        'dateFrom não pode ser depois de dateTo',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Trava a linha do item **dentro** da transação.
   *
   * Query crua porque `FOR UPDATE` não existe na API do Prisma — e query crua não
   * passa pela Client Extension de tenant, então o `company_id` entra à mão aqui.
   * Sem ele, um id de outra empresa seria travado e lido normalmente (o RLS ainda
   * barraria, mas depender só dele deixaria a regra invisível no código).
   */
  private async lockItem(
    tx: Prisma.TransactionClient,
    companyId: string,
    itemId: string,
  ): Promise<LockedItemRow> {
    const rows = await tx.$queryRaw<LockedItemRow[]>`
      SELECT id, sku, name, stock, status
      FROM items
      WHERE id = ${itemId}::uuid AND company_id = ${companyId}::uuid
      FOR UPDATE
    `;

    const item = rows[0];

    if (!item) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Item não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    return item;
  }

  /**
   * Item inativo não recebe entrada nem saída: ele saiu do catálogo (RN-23), e
   * movimentar seria ressuscitá-lo pela porta dos fundos — para voltar a operar,
   * o caminho é reativar.
   *
   * Ajuste continua liberado. É o que permite zerar o saldo remanescente de um
   * item recém-inativado; bloquear também o ajuste prenderia esse saldo para
   * sempre no relatório.
   */
  private ensureItemAcceptsMovement(item: LockedItemRow, type: StockMovementType): void {
    if (item.status === ItemStatus.ACTIVE || type === StockMovementType.ADJUSTMENT) return;

    throw new BusinessException(
      BusinessErrorCode.ITEM_INATIVO,
      `O item ${item.sku} está inativo: reative-o para registrar entradas e saídas`,
    );
  }

  /**
   * O DTO já barra zero; o teto vem de `INVENTORY_MAX_MOVEMENT_QUANTITY` e é
   * conferido em módulo, porque o ajuste pode ser negativo.
   */
  private ensureQuantityIsSane(dto: CreateStockMovementDto): void {
    if (dto.quantity < 0 && !acceptsNegativeQuantity(dto.type)) {
      throw new BusinessException(
        BusinessErrorCode.VALIDACAO_FALHOU,
        `Quantidade de ${dto.type} deve ser positiva: a direção vem do tipo, não do sinal`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const max: number = this.config.get('INVENTORY_MAX_MOVEMENT_QUANTITY', { infer: true });

    if (Math.abs(dto.quantity) > max) {
      throw new BusinessException(
        BusinessErrorCode.VALIDACAO_FALHOU,
        `Quantidade acima do máximo permitido por movimentação (${String(max)})`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
