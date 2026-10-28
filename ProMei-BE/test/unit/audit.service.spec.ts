import { describe, expect, it, vi } from 'vitest';
import { AuditService } from '../../src/modules/audit/audit.service';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/shared/config';
import type { PrismaService } from '../../src/shared/prisma';
import type { Prisma } from '../../src/generated/prisma/client';

interface FindManyArgs {
  where?: Prisma.AuditLogWhereInput;
  skip?: number;
  take?: number;
  orderBy?: { createdAt?: 'asc' | 'desc' };
}

function createService() {
  const findMany = vi.fn((_args: FindManyArgs) => Promise.resolve([]));
  const count = vi.fn(() => Promise.resolve(0));
  const create = vi.fn(() => Promise.resolve({}));

  const prisma = {
    db: { auditLog: { findMany, count, create } },
  } as unknown as PrismaService;

  const config = {
    get: (key: string) => (key === 'PAGINATION_DEFAULT_LIMIT' ? 20 : 100),
  } as unknown as ConfigService<Env, true>;

  return { service: new AuditService(prisma, config), findMany, count, create };
}

function argsOf(findMany: ReturnType<typeof createService>['findMany']): FindManyArgs {
  return findMany.mock.calls[0]?.[0] as FindManyArgs;
}

describe('AuditService', () => {
  describe('log', () => {
    it('normaliza campos ausentes para null em vez de undefined', async () => {
      const { service, create } = createService();

      await service.log({ action: 'login.success', resource: 'auth' });

      expect(create).toHaveBeenCalledWith({
        data: {
          action: 'login.success',
          resource: 'auth',
          userId: null,
          companyId: null,
          diff: undefined,
          ip: null,
        },
      });
    });
  });

  describe('list', () => {
    it('ordena do mais recente para o mais antigo — é assim que se investiga', async () => {
      const { service, findMany } = createService();

      await service.list({});

      expect(argsOf(findMany).orderBy).toEqual({ createdAt: 'desc' });
    });

    it('sem filtro, não restringe nada', async () => {
      const { service, findMany } = createService();

      await service.list({});

      expect(argsOf(findMany).where).toEqual({});
    });

    it('combina os filtros informados', async () => {
      const { service, findMany } = createService();

      await service.list({ action: 'user.created', resource: 'users', userId: 'u-1' });

      expect(argsOf(findMany).where).toEqual({
        action: 'user.created',
        resource: 'users',
        userId: 'u-1',
      });
    });

    it('aceita apenas o limite inferior do intervalo de datas', async () => {
      const { service, findMany } = createService();

      await service.list({ from: '2026-08-01T00:00:00.000Z' });

      expect(argsOf(findMany).where).toEqual({
        createdAt: { gte: new Date('2026-08-01T00:00:00.000Z') },
      });
    });

    it('monta o intervalo fechado quando from e to vêm juntos', async () => {
      const { service, findMany } = createService();

      await service.list({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T23:59:59.000Z' });

      expect(argsOf(findMany).where).toEqual({
        createdAt: {
          gte: new Date('2026-08-01T00:00:00.000Z'),
          lte: new Date('2026-08-31T23:59:59.000Z'),
        },
      });
    });

    it('aplica a mesma cláusula na contagem — total precisa bater com a lista', async () => {
      const { service, findMany, count } = createService();

      await service.list({ action: 'plan.updated' });

      expect(count).toHaveBeenCalledWith({ where: argsOf(findMany).where });
    });

    it('devolve page e limit resolvidos junto com os dados', async () => {
      const { service } = createService();

      const result = await service.list({ page: 2, limit: 5 });

      expect(result).toEqual({ data: [], total: 0, page: 2, limit: 5 });
    });

    it('traduz página em skip', async () => {
      const { service, findMany } = createService();

      await service.list({ page: 3, limit: 10 });

      expect(argsOf(findMany).skip).toBe(20);
      expect(argsOf(findMany).take).toBe(10);
    });
  });
});
