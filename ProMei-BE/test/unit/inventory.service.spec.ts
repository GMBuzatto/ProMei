import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { resolveStockDelta } from '../../src/modules/inventory/stock-delta';
import { ItemStatus, Prisma, StockMovementType } from '../../src/generated/prisma/client';
import type { AuditService } from '../../src/modules/audit/audit.service';
import type { ReceiptsService } from '../../src/modules/receipts';
import type { PrismaService } from '../../src/shared/prisma';
import type { BusinessException } from '../../src/shared/errors';

const COMPANY = 'company-a';
const USER = 'user-1';
const ITEM = 'item-1';

const ENV: Record<string, number> = {
  INVENTORY_LOCK_TIMEOUT_MS: 5_000,
  INVENTORY_TRANSACTION_TIMEOUT_MS: 10_000,
  INVENTORY_MAX_MOVEMENT_QUANTITY: 1_000_000,
};

interface LockedRow {
  id: string;
  sku: string;
  name: string;
  stock: number;
  status: ItemStatus;
}

const itemWithStock: LockedRow = {
  id: ITEM,
  sku: 'PARAF-001',
  name: 'Parafuso 3/8',
  stock: 50,
  status: ItemStatus.ACTIVE,
};

function validMovement(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    itemId: ITEM,
    type: StockMovementType.OUT,
    quantity: 10,
    reason: 'venda balcão',
    ...overrides,
  } as never;
}

/** Executa e devolve a BusinessException lançada — falha o teste se não lançar. */
async function capture(action: () => Promise<unknown>): Promise<BusinessException> {
  try {
    await action();
  } catch (error) {
    return error as BusinessException;
  }
  throw new Error('Esperava uma exceção, mas a chamada foi bem-sucedida');
}

function createService(
  options: {
    item?: LockedRow | null;
    /** Erro que o `SELECT ... FOR UPDATE` deve lançar (ex.: timeout de lock). */
    lockError?: Error;
  } = {},
) {
  const { item = itemWithStock, lockError } = options;

  const executedSql: string[] = [];

  const queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    executedSql.push(strings.join(''));
    if (lockError) throw lockError;
    return await Promise.resolve(item ? [item] : []);
  });

  const executeRaw = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    executedSql.push(`${strings.join('')} :: ${values.join(',')}`);
    return Promise.resolve(1);
  });

  const createMovement = vi.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'mov-1', createdAt: new Date(), ...args.data }),
  );

  const updateItem = vi.fn((_args: { where: unknown; data: { stock: number } }) =>
    Promise.resolve(item),
  );

  const tx = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    stockMovement: { create: createMovement },
    item: { update: updateItem },
  };

  const transactionOptions: { timeout?: number; maxWait?: number }[] = [];

  const prisma = {
    withTenantSession: vi.fn(
      (callback: (tx: unknown) => Promise<unknown>, txOptions?: { timeout?: number }) => {
        transactionOptions.push(txOptions ?? {});
        return callback(tx);
      },
    ),
  } as unknown as PrismaService;

  const config = {
    get: (key: string) => ENV[key],
  } as unknown as ConfigService<Record<string, unknown>, true>;

  const log = vi.fn((_entry: { action: string; diff?: unknown }) => Promise.resolve());

  const receiptRecord = { id: 'receipt-1', number: 7n, pdfUrl: null, createdAt: new Date() };
  const allocateReceipt = vi.fn((_tx: unknown, _companyId: string) =>
    Promise.resolve(receiptRecord),
  );
  const schedulePdf = vi.fn((_receiptId: string, _companyId: string) => undefined);
  const receipts = {
    allocate: allocateReceipt,
    schedulePdfGeneration: schedulePdf,
    toSummary: (receipt: { id: string; number: bigint }) => ({
      id: receipt.id,
      number: receipt.number.toString(),
      formattedNumber: receipt.number.toString().padStart(6, '0'),
      pdfStatus: 'PENDING' as const,
      pdfUrl: null,
      createdAt: new Date(),
    }),
  } as unknown as ReceiptsService;

  const service = new InventoryService(
    prisma,
    config,
    { log } as unknown as AuditService,
    receipts,
  );

  return {
    service,
    createMovement,
    updateItem,
    executedSql,
    transactionOptions,
    log,
    allocateReceipt,
    schedulePdf,
  };
}

/** Erro de lock indisponível como o driver o entrega. */
function buildLockError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'canceling statement due to lock timeout (55P03)',
    { code: 'P2010', clientVersion: 'test' },
  );
}

describe('resolveStockDelta (RF-32)', () => {
  it('entrada soma e saída subtrai — a direção vem do tipo', () => {
    expect(resolveStockDelta(StockMovementType.IN, 10)).toBe(10);
    expect(resolveStockDelta(StockMovementType.OUT, 10)).toBe(-10);
  });

  it('ajuste respeita o sinal informado, para os dois lados (RN-22)', () => {
    expect(resolveStockDelta(StockMovementType.ADJUSTMENT, -3)).toBe(-3);
    expect(resolveStockDelta(StockMovementType.ADJUSTMENT, 3)).toBe(3);
  });
});

describe('InventoryService', () => {
  describe('RF-32 — entrada, saída e ajuste', () => {
    it('entrada soma ao saldo do item', async () => {
      const { service, updateItem } = createService();

      const result = await service.createMovement(
        COMPANY,
        USER,
        validMovement({ type: StockMovementType.IN, quantity: 20 }),
      );

      expect(result.item.stock).toBe(70);
      expect(updateItem.mock.calls[0]?.[0].data.stock).toBe(70);
    });

    it('saída subtrai do saldo do item', async () => {
      const { service, updateItem } = createService();

      const result = await service.createMovement(COMPANY, USER, validMovement());

      expect(result.item.stock).toBe(40);
      expect(updateItem.mock.calls[0]?.[0].data.stock).toBe(40);
    });

    it('ajuste negativo corrige saldo inflado sem apagar histórico (RN-22)', async () => {
      const { service, createMovement } = createService();

      const result = await service.createMovement(
        COMPANY,
        USER,
        validMovement({
          type: StockMovementType.ADJUSTMENT,
          quantity: -3,
          reason: 'contagem física',
        }),
      );

      expect(result.item.stock).toBe(47);
      expect(createMovement).toHaveBeenCalledOnce();
    });

    it('registra quem, quantidade e motivo na movimentação', async () => {
      const { service, createMovement } = createService();

      await service.createMovement(COMPANY, USER, validMovement());

      expect(createMovement.mock.calls[0]?.[0].data).toMatchObject({
        companyId: COMPANY,
        itemId: ITEM,
        userId: USER,
        type: StockMovementType.OUT,
        quantity: 10,
        reason: 'venda balcão',
      });
    });

    it('recusa entrada/saída com quantidade negativa: o sinal não é a direção', async () => {
      const { service, createMovement } = createService();

      const thrown = await capture(() =>
        service.createMovement(
          COMPANY,
          USER,
          validMovement({ type: StockMovementType.IN, quantity: -5 }),
        ),
      );

      expect(thrown.code).toBe('VALIDACAO_FALHOU');
      expect(thrown.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(createMovement).not.toHaveBeenCalled();
    });

    it('recusa quantidade acima do teto de configuração', async () => {
      const { service } = createService();

      const thrown = await capture(() =>
        service.createMovement(
          COMPANY,
          USER,
          validMovement({ type: StockMovementType.IN, quantity: 1_000_001 }),
        ),
      );

      expect(thrown.code).toBe('VALIDACAO_FALHOU');
    });

    it('404 quando o item não é da empresa (o lock já filtra por company_id)', async () => {
      const { service } = createService({ item: null });

      const thrown = await capture(() => service.createMovement(COMPANY, USER, validMovement()));

      expect(thrown.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(thrown.code).toBe('RECURSO_NAO_ENCONTRADO');
    });
  });

  describe('RN-21 — estoque nunca fica negativo', () => {
    it('rejeita saída maior que o saldo e não grava nada', async () => {
      const { service, createMovement, updateItem } = createService();

      const thrown = await capture(() =>
        service.createMovement(COMPANY, USER, validMovement({ quantity: 100 })),
      );

      expect(thrown.code).toBe('ESTOQUE_INSUFICIENTE');
      expect(thrown.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(createMovement).not.toHaveBeenCalled();
      expect(updateItem).not.toHaveBeenCalled();
    });

    it('a mensagem diz o saldo disponível e o solicitado', async () => {
      const { service } = createService();

      const thrown = await capture(() =>
        service.createMovement(COMPANY, USER, validMovement({ quantity: 100 })),
      );

      expect(thrown.message).toContain('50');
      expect(thrown.message).toContain('100');
    });

    it('permite zerar o saldo: o limite é negativo, não zero', async () => {
      const { service } = createService();

      const result = await service.createMovement(COMPANY, USER, validMovement({ quantity: 50 }));

      expect(result.item.stock).toBe(0);
    });

    it('ajuste negativo também não pode derrubar o saldo abaixo de zero', async () => {
      const { service } = createService();

      const thrown = await capture(() =>
        service.createMovement(
          COMPANY,
          USER,
          validMovement({ type: StockMovementType.ADJUSTMENT, quantity: -51 }),
        ),
      );

      expect(thrown.code).toBe('ESTOQUE_INSUFICIENTE');
    });
  });

  describe('transação e lock', () => {
    it('trava a linha do item com SELECT ... FOR UPDATE antes de decidir', async () => {
      const { service, executedSql } = createService();

      await service.createMovement(COMPANY, USER, validMovement());

      const lock = executedSql.find((sql) => sql.includes('FOR UPDATE'));
      expect(lock).toBeDefined();
      expect(lock).toContain('company_id');
    });

    it('aplica lock_timeout local antes de tentar o lock', async () => {
      const { service, executedSql } = createService();

      await service.createMovement(COMPANY, USER, validMovement());

      const timeout = executedSql.findIndex((sql) => sql.includes('lock_timeout'));
      const lock = executedSql.findIndex((sql) => sql.includes('FOR UPDATE'));

      expect(timeout).toBeGreaterThanOrEqual(0);
      expect(timeout).toBeLessThan(lock);
      expect(executedSql[timeout]).toContain('5000ms');
    });

    it('grava movimentação e saldo na MESMA transação de tenant', async () => {
      const { service, createMovement, updateItem, transactionOptions } = createService();

      await service.createMovement(COMPANY, USER, validMovement());

      expect(transactionOptions[0]).toMatchObject({ timeout: 10_000, maxWait: 5_000 });
      expect(createMovement).toHaveBeenCalledOnce();
      expect(updateItem).toHaveBeenCalledOnce();
    });

    it('teto da transação é maior que o do lock, senão o motivo real se perde', async () => {
      const { service, transactionOptions } = createService();

      await service.createMovement(COMPANY, USER, validMovement());

      const { timeout = 0, maxWait = 0 } = transactionOptions[0] ?? {};
      expect(timeout).toBeGreaterThan(maxWait);
    });

    it('timeout de lock vira 409, não 500: é fila, e a requisição pode ser repetida', async () => {
      const { service } = createService({ lockError: buildLockError() });

      const thrown = await capture(() => service.createMovement(COMPANY, USER, validMovement()));

      expect(thrown.code).toBe('CONFLITO_DE_CONCORRENCIA');
      expect(thrown.getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('erro que não é de contenção sobe intacto para o filter global', async () => {
      const anyFailure = new Error('conexão caiu');
      const { service } = createService({ lockError: anyFailure });

      const thrown = await capture(() => service.createMovement(COMPANY, USER, validMovement()));

      expect(thrown).toBe(anyFailure);
    });
  });

  describe('item inativo', () => {
    const inactive: LockedRow = { ...itemWithStock, status: ItemStatus.INACTIVE };

    it('recusa saída em item inativo', async () => {
      const { service } = createService({ item: inactive });

      const thrown = await capture(() => service.createMovement(COMPANY, USER, validMovement()));

      expect(thrown.code).toBe('ITEM_INATIVO');
    });

    it('permite ajuste em item inativo: é o que zera saldo remanescente', async () => {
      const { service } = createService({ item: inactive });

      const result = await service.createMovement(
        COMPANY,
        USER,
        validMovement({
          type: StockMovementType.ADJUSTMENT,
          quantity: -50,
          reason: 'baixa de saldo remanescente',
        }),
      );

      expect(result.item.stock).toBe(0);
    });
  });

  describe('RF-33 — comprovante de saída', () => {
    it('saída emite comprovante na mesma transação e vincula à movimentação', async () => {
      const { service, createMovement, allocateReceipt } = createService();

      const result = await service.createMovement(COMPANY, USER, validMovement());

      expect(allocateReceipt).toHaveBeenCalledOnce();
      expect(createMovement.mock.calls[0]?.[0].data.receiptId).toBe('receipt-1');
      expect(result.receipt).toMatchObject({ number: '7', formattedNumber: '000007' });
    });

    it('entrada e ajuste não geram comprovante', async () => {
      for (const type of [StockMovementType.IN, StockMovementType.ADJUSTMENT]) {
        const { service, allocateReceipt, createMovement } = createService();

        const result = await service.createMovement(
          COMPANY,
          USER,
          validMovement({ type, quantity: 5 }),
        );

        expect(allocateReceipt).not.toHaveBeenCalled();
        expect(createMovement.mock.calls[0]?.[0].data).not.toHaveProperty('receiptId');
        expect(result.receipt).toBeNull();
      }
    });

    it('o PDF é agendado depois do commit, não dentro da transação', async () => {
      const { service, schedulePdf } = createService();

      await service.createMovement(COMPANY, USER, validMovement());

      expect(schedulePdf).toHaveBeenCalledWith('receipt-1', COMPANY);
    });

    it('a resposta sai com o comprovante pendente: o número já vale, o PDF vem depois', async () => {
      const { service } = createService();

      const result = await service.createMovement(COMPANY, USER, validMovement());

      expect(result.receipt?.pdfStatus).toBe('PENDING');
    });

    it('saída recusada não queima número de comprovante nem agenda PDF', async () => {
      const { service, schedulePdf } = createService();

      await capture(() => service.createMovement(COMPANY, USER, validMovement({ quantity: 100 })));

      expect(schedulePdf).not.toHaveBeenCalled();
    });
  });

  describe('auditoria', () => {
    it('registra a movimentação com o saldo resultante', async () => {
      const { service, log } = createService();

      await service.createMovement(COMPANY, USER, validMovement());

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'stock-movement.created',
          resource: 'stock-movements',
          userId: USER,
          companyId: COMPANY,
          diff: expect.objectContaining({ stockAfter: 40, quantity: 10 }) as unknown,
        }),
      );
    });

    it('não audita o que não aconteceu: saída recusada não gera trilha', async () => {
      const { service, log } = createService();

      await capture(() => service.createMovement(COMPANY, USER, validMovement({ quantity: 100 })));

      expect(log).not.toHaveBeenCalled();
    });
  });
});
