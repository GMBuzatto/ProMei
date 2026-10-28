import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PlansService } from '../../src/modules/plans/plans.service';
import { Prisma } from '../../src/generated/prisma/client';
import type { AuditService } from '../../src/modules/audit/audit.service';
import type { PrismaService } from '../../src/shared/prisma';
import type { BusinessException } from '../../src/shared/errors';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/shared/config';
import type { CreatePlanDto } from '../../src/modules/plans/dto/create-plan.dto';

const PLAN_ID = 'plan-1';

const existingPlan = {
  id: PLAN_ID,
  name: 'Essencial',
  price: new Prisma.Decimal(49.9),
  period: 'monthly',
  limits: { maxUsers: 5, maxItems: 200 },
};

const validDto: CreatePlanDto = {
  name: 'Essencial',
  price: 49.9,
  period: 'monthly',
  limits: { maxUsers: 5, maxItems: 200 },
};

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('conflito', { code, clientVersion: 'test' });
}

/** Executa e devolve a BusinessException lançada — falha o teste se não lançar. */
async function capture(action: () => Promise<unknown>): Promise<BusinessException> {
  try {
    await action();
  } catch (error) {
    return error as BusinessException;
  }
  throw new Error('esperava BusinessException, nada foi lançado');
}

function createService(options: { plan?: typeof existingPlan | null; deleteError?: Error } = {}) {
  const { plan = existingPlan, deleteError } = options;

  const planDelegate = {
    create: vi.fn((args: { data: unknown }) =>
      Promise.resolve({ id: PLAN_ID, ...(args.data as object) }),
    ),
    findUnique: vi.fn(() => Promise.resolve(plan)),
    findMany: vi.fn(() => Promise.resolve([existingPlan])),
    count: vi.fn(() => Promise.resolve(1)),
    update: vi.fn((args: { data: unknown }) =>
      Promise.resolve({ ...existingPlan, ...(args.data as object) }),
    ),
    delete: vi.fn(() =>
      deleteError ? Promise.reject(deleteError) : Promise.resolve(existingPlan),
    ),
  };

  const prisma = { db: { plan: planDelegate } } as unknown as PrismaService;
  const log = vi.fn((_entry: { action: string; diff?: unknown }) => Promise.resolve());
  const audit = { log } as unknown as AuditService;
  const config = { get: () => 20 } as unknown as ConfigService<Env, true>;

  return { service: new PlansService(prisma, config, audit), planDelegate, log };
}

describe('PlansService (RF-21, RN-14)', () => {
  describe('findOne', () => {
    it('plano inexistente responde 404', async () => {
      const { service } = createService({ plan: null });

      const thrown = await capture(() => service.findOne(PLAN_ID));

      expect(thrown.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(thrown.code).toBe('RECURSO_NAO_ENCONTRADO');
    });
  });

  describe('remove', () => {
    it('plano em uso não é excluído — vira 409, não 500', async () => {
      // P2003: violação de chave estrangeira. Sem esta tradução, tentar excluir
      // um plano com assinaturas vazaria erro do Prisma como erro interno.
      const { service } = createService({ deleteError: prismaError('P2003') });

      const thrown = await capture(() => service.remove(PLAN_ID));

      expect(thrown.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(thrown.code).toBe('VALIDACAO_FALHOU');
    });

    it('erro de banco que não é conflito continua subindo', async () => {
      // Engolir qualquer erro aqui esconderia falha real de infraestrutura.
      const { service } = createService({ deleteError: prismaError('P1001') });

      await expect(service.remove(PLAN_ID)).rejects.toThrow();
    });

    it('plano em uso não gera registro de exclusão na auditoria', async () => {
      const { service, log } = createService({ deleteError: prismaError('P2003') });

      await capture(() => service.remove(PLAN_ID));

      expect(log).not.toHaveBeenCalled();
    });

    it('exclusão bem-sucedida é auditada', async () => {
      const { service, log } = createService();

      await service.remove(PLAN_ID, 'ator-1', '203.0.113.5');

      expect(log.mock.calls[0]?.[0]).toMatchObject({ action: 'plan.deleted' });
    });
  });

  describe('auditoria de alteração de limites (RN-14)', () => {
    it('registra antes e depois — mudança de limite afeta todas as empresas do plano', async () => {
      const { service, log } = createService();

      await service.update(PLAN_ID, { limits: { maxUsers: 10, maxItems: 500 } }, 'ator-1');

      const diff = log.mock.calls[0]?.[0].diff as {
        before: { limits: unknown };
        after: { limits: unknown };
      };
      expect(diff.before.limits).toEqual({ maxUsers: 5, maxItems: 200 });
      expect(diff.after.limits).toEqual({ maxUsers: 10, maxItems: 500 });
    });

    it('atualizar plano inexistente falha antes de gravar qualquer coisa', async () => {
      const { service, planDelegate } = createService({ plan: null });

      await capture(() => service.update(PLAN_ID, { name: 'Novo' }));

      expect(planDelegate.update).not.toHaveBeenCalled();
    });

    it('criação registra os limites concedidos', async () => {
      const { service, log } = createService();

      await service.create(validDto, 'ator-1');

      expect(log.mock.calls[0]?.[0]).toMatchObject({ action: 'plan.created' });
      expect((log.mock.calls[0]?.[0].diff as { limits: unknown }).limits).toEqual(validDto.limits);
    });
  });

  describe('paginação', () => {
    it('devolve total junto com os dados', async () => {
      const { service } = createService();

      const result = await service.findAll(1, 10);

      expect(result).toMatchObject({ total: 1, page: 1, limit: 10 });
    });
  });
});
