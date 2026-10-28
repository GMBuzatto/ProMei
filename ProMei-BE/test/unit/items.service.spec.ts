import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { ItemsService } from '../../src/modules/items/items.service';
import { ItemStatus, Prisma } from '../../src/generated/prisma/client';
import type { AuditService } from '../../src/modules/audit/audit.service';
import type { PrismaService } from '../../src/shared/prisma';
import type { BusinessException } from '../../src/shared/errors';

const COMPANY = 'company-a';
const OUTRA_COMPANY = 'company-b';

const ENV: Record<string, string | number> = {
  ITEM_SKU_PREFIX: 'ITM',
  ITEM_SKU_SEQUENCE_PADDING: 6,
  ITEM_SKU_MAX_ATTEMPTS: 5,
  PAGINATION_DEFAULT_LIMIT: 20,
  PAGINATION_MAX_LIMIT: 100,
};

interface ItemFake {
  id: string;
  companyId: string;
  sku: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  minStock: number;
  status: ItemStatus;
  description?: string | null;
  category?: string | null;
}

const activeItem: ItemFake = {
  id: 'item-1',
  companyId: COMPANY,
  sku: 'PARAF-001',
  name: 'Parafuso 3/8',
  unit: 'un',
  price: 2.5,
  stock: 50,
  minStock: 10,
  status: ItemStatus.ACTIVE,
  description: 'Parafuso sextavado',
  category: 'Fixadores',
};

const validDto = { name: 'Parafuso 3/8', unit: 'un', price: 2.5 };

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('conflito', {
    code,
    clientVersion: 'test',
  });
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
    item?: ItemFake | null;
    lastGeneratedSku?: string | null;
    skuAlreadyUsed?: boolean;
    movements?: number;
    /** Erros que o `create` deve lançar, em ordem, antes de finalmente funcionar. */
    createErrors?: Prisma.PrismaClientKnownRequestError[];
    deleteError?: Prisma.PrismaClientKnownRequestError;
    subscription?: { plan: { limits: unknown; name: string } } | null;
    activeItems?: number;
  } = {},
) {
  const {
    item = activeItem,
    lastGeneratedSku = null,
    skuAlreadyUsed = false,
    movements = 0,
    createErrors = [],
    deleteError,
    subscription = null,
    activeItems = 0,
  } = options;

  const errorQueue = [...createErrors];

  const itemDelegate = {
    // `findFirst` serve a três chamadas diferentes; o `where` diz qual é.
    findFirst: vi.fn((args: { where?: Record<string, unknown>; select?: unknown }) => {
      const where = args.where ?? {};

      // nextSkuSequence: busca o último SKU gerado da empresa.
      if (typeof where.sku === 'object' && where.sku !== null) {
        return Promise.resolve(lastGeneratedSku ? { sku: lastGeneratedSku } : null);
      }

      // ensureSkuAvailable: busca SKU exato.
      if (typeof where.sku === 'string') {
        return Promise.resolve(skuAlreadyUsed ? { id: 'item-existente' } : null);
      }

      // findOne: busca por id.
      return Promise.resolve(item);
    }),
    // Os parâmetros são tipados para que `mock.calls[0][0]` sirva às asserções
    // sobre o `where` montado pelo service.
    findMany: vi.fn((_args: { where?: Record<string, unknown>; skip?: number; take?: number }) =>
      Promise.resolve([activeItem]),
    ),
    count: vi.fn((_args: { where?: Record<string, unknown> }) => Promise.resolve(activeItems)),
    create: vi.fn((args: { data: { sku: string } }) => {
      const thrown = errorQueue.shift();
      if (thrown) return Promise.reject(thrown);
      return Promise.resolve({ ...activeItem, sku: args.data.sku });
    }),
    update: vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...activeItem, ...args.data }),
    ),
    delete: vi.fn(() => (deleteError ? Promise.reject(deleteError) : Promise.resolve(activeItem))),
  };

  const prisma = {
    db: {
      item: itemDelegate,
      stockMovement: { count: vi.fn(() => Promise.resolve(movements)) },
      subscription: { findUnique: vi.fn(() => Promise.resolve(subscription)) },
    },
  } as unknown as PrismaService;

  const config = {
    get: (key: string) => ENV[key],
  } as unknown as ConfigService<Record<string, unknown>, true>;

  const log = vi.fn((_entry: { action: string; diff?: unknown }) => Promise.resolve());

  const service = new ItemsService(prisma, config, { log } as unknown as AuditService);

  return { service, itemDelegate, prisma, log };
}

describe('ItemsService', () => {
  describe('RN-25 — SKU gerado automaticamente quando não informado', () => {
    it('gera o primeiro SKU da empresa a partir do prefixo e padding de config', async () => {
      const { service, itemDelegate } = createService();

      const item = await service.create(COMPANY, validDto);

      expect(item.sku).toBe('ITM-000001');
      expect(itemDelegate.create).toHaveBeenCalledOnce();
    });

    it('continua a sequência a partir do maior SKU já gerado', async () => {
      const { service } = createService({ lastGeneratedSku: 'ITM-000041' });

      const item = await service.create(COMPANY, validDto);

      expect(item.sku).toBe('ITM-000042');
    });

    it('não sobrescreve SKU informado pelo usuário', async () => {
      const { service } = createService();

      const item = await service.create(COMPANY, { ...validDto, sku: 'PARAF-001' });

      expect(item.sku).toBe('PARAF-001');
    });

    it('grava apenas os campos enviados, sem inventar descrição ou categoria', async () => {
      const { service, itemDelegate } = createService();

      await service.create(COMPANY, validDto);

      const data = itemDelegate.create.mock.calls[0]?.[0].data as Record<string, unknown>;
      expect(data).not.toHaveProperty('description');
      expect(data).not.toHaveProperty('category');
      expect(data.companyId).toBe(COMPANY);
    });

    it('nunca aceita saldo inicial: estoque só muda por movimentação (RN-22)', async () => {
      const { service, itemDelegate } = createService();

      await service.create(COMPANY, { ...validDto, stock: 999 } as never);

      const data = itemDelegate.create.mock.calls[0]?.[0].data as Record<string, unknown>;
      expect(data).not.toHaveProperty('stock');
    });
  });

  describe('RN-20 — SKU único por empresa', () => {
    it('rejeita SKU já usado na mesma empresa', async () => {
      const { service, itemDelegate } = createService({ skuAlreadyUsed: true });

      const thrown = await capture(() =>
        service.create(COMPANY, { ...validDto, sku: 'PARAF-001' }),
      );

      expect(thrown.code).toBe('SKU_JA_EXISTE');
      expect(thrown.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(itemDelegate.create).not.toHaveBeenCalled();
    });

    it('confere a disponibilidade do SKU dentro da empresa, não globalmente', async () => {
      const { service, itemDelegate } = createService();

      await service.create(OUTRA_COMPANY, { ...validDto, sku: 'PARAF-001' });

      const where = itemDelegate.findFirst.mock.calls.find(
        (call) => typeof call[0].where?.sku === 'string',
      )?.[0].where;

      expect(where).toEqual({ companyId: OUTRA_COMPANY, sku: 'PARAF-001' });
    });

    it('converte a violação do índice único em erro de negócio (corrida)', async () => {
      const { service } = createService({ createErrors: [prismaError('P2002')] });

      const thrown = await capture(() =>
        service.create(COMPANY, { ...validDto, sku: 'PARAF-001' }),
      );

      expect(thrown.code).toBe('SKU_JA_EXISTE');
    });

    it('tenta o próximo sequencial quando o SKU gerado colide', async () => {
      const { service, itemDelegate } = createService({ createErrors: [prismaError('P2002')] });

      const item = await service.create(COMPANY, validDto);

      expect(item.sku).toBe('ITM-000002');
      expect(itemDelegate.create).toHaveBeenCalledTimes(2);
    });

    it('desiste depois de esgotar as tentativas configuradas', async () => {
      const { service, itemDelegate } = createService({
        createErrors: Array.from({ length: 5 }, () => prismaError('P2002')),
      });

      const thrown = await capture(() => service.create(COMPANY, validDto));

      expect(thrown.code).toBe('SKU_NAO_GERADO');
      expect(itemDelegate.create).toHaveBeenCalledTimes(5);
    });

    it('não engole erro de banco que não seja violação de unicidade', async () => {
      const { service } = createService({ createErrors: [prismaError('P1001')] });

      const thrown = await capture(() => service.create(COMPANY, validDto));

      expect(thrown).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });

    it('valida o novo SKU ao atualizar', async () => {
      const { service } = createService({ skuAlreadyUsed: true });

      const thrown = await capture(() => service.update('item-1', COMPANY, { sku: 'OUTRO-999' }));

      expect(thrown.code).toBe('SKU_JA_EXISTE');
    });

    it('não reclama quando o SKU do PATCH é o mesmo que o item já tem', async () => {
      const { service, itemDelegate } = createService({ skuAlreadyUsed: true });

      await service.update('item-1', COMPANY, { sku: activeItem.sku });

      expect(itemDelegate.update).toHaveBeenCalledOnce();
    });
  });

  describe('RN-23 — item com movimentação inativa, não exclui', () => {
    it('inativa em vez de excluir quando existe movimentação', async () => {
      const { service, itemDelegate } = createService({ movements: 3 });

      const result = await service.remove('item-1', COMPANY);

      expect(result).toEqual({ id: 'item-1', outcome: 'INACTIVATED' });
      expect(itemDelegate.delete).not.toHaveBeenCalled();
      expect(itemDelegate.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { status: ItemStatus.INACTIVE },
      });
    });

    it('exclui de fato o item que nunca teve movimentação', async () => {
      const { service, itemDelegate } = createService({ movements: 0 });

      const result = await service.remove('item-1', COMPANY);

      expect(result).toEqual({ id: 'item-1', outcome: 'DELETED' });
      expect(itemDelegate.delete).toHaveBeenCalledOnce();
    });

    it('inativa quando a FK barra o DELETE — movimentação criada na corrida', async () => {
      const { service, itemDelegate } = createService({
        movements: 0,
        deleteError: prismaError('P2003'),
      });

      const result = await service.remove('item-1', COMPANY);

      expect(result.outcome).toBe('INACTIVATED');
      expect(itemDelegate.update).toHaveBeenCalledOnce();
    });

    it('404 ao remover item de outra empresa', async () => {
      const { service } = createService({ item: null });

      const thrown = await capture(() => service.remove('item-1', COMPANY));

      expect(thrown.code).toBe('RECURSO_NAO_ENCONTRADO');
      expect(thrown.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('registra a inativação na trilha de auditoria', async () => {
      const { service, log } = createService({ movements: 1 });

      await service.remove('item-1', COMPANY, 'admin-1', '10.0.0.1');

      expect(log.mock.calls.map((call) => call[0].action)).toContain('item.deactivated');
    });

    it('reativa item inativo', async () => {
      const { service } = createService({ item: { ...activeItem, status: ItemStatus.INACTIVE } });

      const item = await service.updateStatus('item-1', COMPANY, ItemStatus.ACTIVE);

      expect(item.status).toBe(ItemStatus.ACTIVE);
    });

    it('é idempotente quando o status pedido já é o atual', async () => {
      const { service, itemDelegate } = createService();

      await service.updateStatus('item-1', COMPANY, ItemStatus.ACTIVE);

      expect(itemDelegate.update).not.toHaveBeenCalled();
    });
  });

  describe('RF-31 — busca, filtro e paginação', () => {
    it('busca em nome, SKU e descrição, sem diferenciar maiúsculas', async () => {
      const { service, itemDelegate } = createService();

      await service.findAll(COMPANY, { search: 'parafuso' });

      const where = itemDelegate.findMany.mock.calls[0]?.[0].where as {
        OR: Record<string, unknown>[];
      };

      expect(where.OR).toEqual([
        { name: { contains: 'parafuso', mode: 'insensitive' } },
        { sku: { contains: 'parafuso', mode: 'insensitive' } },
        { description: { contains: 'parafuso', mode: 'insensitive' } },
      ]);
    });

    it('filtra por categoria e status dentro do escopo da empresa', async () => {
      const { service, itemDelegate } = createService();

      await service.findAll(COMPANY, { category: 'Fixadores', status: ItemStatus.ACTIVE });

      expect(itemDelegate.findMany.mock.calls[0]?.[0].where).toEqual({
        companyId: COMPANY,
        category: 'Fixadores',
        status: ItemStatus.ACTIVE,
      });
    });

    it('sem filtro de status, devolve ativos e inativos', async () => {
      const { service, itemDelegate } = createService();

      await service.findAll(COMPANY, {});

      expect(itemDelegate.findMany.mock.calls[0]?.[0].where).toEqual({ companyId: COMPANY });
    });

    it('usa o limite padrão de config quando o cliente não pede', async () => {
      const { service, itemDelegate } = createService();

      const result = await service.findAll(COMPANY, {});

      expect(itemDelegate.findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 0, take: 20 });
      expect(result).toMatchObject({ page: 1, limit: 20, total: 0 });
    });

    it('corta o limite pedido no teto de config', async () => {
      const { service, itemDelegate } = createService();

      await service.findAll(COMPANY, { page: 3, limit: 500 });

      expect(itemDelegate.findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 200, take: 100 });
    });

    it('conta com o mesmo filtro da listagem', async () => {
      const { service, itemDelegate } = createService();

      await service.findAll(COMPANY, { category: 'Fixadores' });

      expect(itemDelegate.count.mock.calls[0]?.[0].where).toEqual(
        itemDelegate.findMany.mock.calls[0]?.[0].where,
      );
    });
  });

  describe('RN-14 — limite de itens do plano', () => {
    it('bloqueia a criação quando o plano está no teto', async () => {
      const { service } = createService({
        subscription: { plan: { name: 'Starter', limits: { maxItems: 10 } } },
        activeItems: 10,
      });

      const thrown = await capture(() => service.create(COMPANY, validDto));

      expect(thrown.code).toBe('LIMITE_PLANO_EXCEDIDO');
    });

    it('deixa criar quando ainda há vaga', async () => {
      const { service, itemDelegate } = createService({
        subscription: { plan: { name: 'Starter', limits: { maxItems: 10 } } },
        activeItems: 9,
      });

      await service.create(COMPANY, validDto);

      expect(itemDelegate.create).toHaveBeenCalledOnce();
    });

    it('plano sem limite declarado não bloqueia', async () => {
      const { service, itemDelegate } = createService({
        subscription: { plan: { name: 'Enterprise', limits: {} } },
        activeItems: 5_000,
      });

      await service.create(COMPANY, validDto);

      expect(itemDelegate.create).toHaveBeenCalledOnce();
    });

    it('reativar item também consome vaga', async () => {
      const { service } = createService({
        item: { ...activeItem, status: ItemStatus.INACTIVE },
        subscription: { plan: { name: 'Starter', limits: { maxItems: 10 } } },
        activeItems: 10,
      });

      const thrown = await capture(() =>
        service.updateStatus('item-1', COMPANY, ItemStatus.ACTIVE),
      );

      expect(thrown.code).toBe('LIMITE_PLANO_EXCEDIDO');
    });

    it('inativar nunca esbarra no limite', async () => {
      const { service, itemDelegate } = createService({
        subscription: { plan: { name: 'Starter', limits: { maxItems: 10 } } },
        activeItems: 10,
      });

      await service.updateStatus('item-1', COMPANY, ItemStatus.INACTIVE);

      expect(itemDelegate.update).toHaveBeenCalledOnce();
    });
  });
});
