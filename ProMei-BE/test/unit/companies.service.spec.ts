import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CompaniesService } from '../../src/modules/companies/companies.service';
import { CompanySegment } from '../../src/generated/prisma/client';
import type { AuditService } from '../../src/modules/audit/audit.service';
import type { PasswordService } from '../../src/modules/auth/password.service';
import type { PrismaService } from '../../src/shared/prisma';
import type { BusinessException } from '../../src/shared/errors';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/shared/config';

const PLAN_ID = '11111111-1111-1111-1111-111111111111';

const validDto = {
  name: 'Mercearia do Zé',
  document: '12345678000199',
  segment: CompanySegment.RETAIL,
  adminEmail: 'ze@mercearia.com',
  adminPassword: 'SenhaValida123!',
};

/** Executa e devolve a BusinessException lançada — falha o teste se não lançar. */
async function capture(action: () => Promise<unknown>): Promise<BusinessException> {
  try {
    await action();
  } catch (error) {
    return error as BusinessException;
  }
  throw new Error('esperava BusinessException, nada foi lançado');
}

function createService(
  options: {
    documentTaken?: boolean;
    emailTaken?: boolean;
    planExists?: boolean;
    transactionFails?: boolean;
    emptyPermissionCatalog?: boolean;
  } = {},
) {
  const {
    documentTaken = false,
    emailTaken = false,
    planExists = true,
    transactionFails = false,
    emptyPermissionCatalog = false,
  } = options;

  const created: {
    company: unknown[];
    role: unknown[];
    user: unknown[];
    userRole: unknown[];
    subscription: unknown[];
    rolePermission: unknown[];
  } = {
    company: [],
    role: [],
    user: [],
    userRole: [],
    subscription: [],
    rolePermission: [],
  };

  const tx = {
    company: {
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        created.company.push(args.data);
        return Promise.resolve({ id: 'company-1', ...args.data });
      }),
    },
    role: {
      create: vi.fn((args: { data: { name: string } }) => {
        created.role.push(args.data);
        return Promise.resolve({ id: `role-${args.data.name}`, ...args.data });
      }),
    },
    user: {
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        created.user.push(args.data);
        return Promise.resolve({ id: 'user-1', ...args.data });
      }),
    },
    userRole: {
      create: vi.fn((args: { data: unknown }) => {
        created.userRole.push(args.data);
        return Promise.resolve({});
      }),
    },
    subscription: {
      create: vi.fn((args: { data: unknown }) => {
        created.subscription.push(args.data);
        return Promise.resolve({});
      }),
    },
    permission: {
      findMany: vi.fn(() =>
        Promise.resolve(emptyPermissionCatalog ? [] : [{ id: 'perm-1' }, { id: 'perm-2' }]),
      ),
    },
    rolePermission: {
      createMany: vi.fn((args: { data: unknown[] }) => {
        created.rolePermission.push(...args.data);
        return Promise.resolve({ count: args.data.length });
      }),
    },
  };

  const transaction = vi.fn((callback: (client: typeof tx) => Promise<unknown>) => {
    if (transactionFails) return Promise.reject(new Error('falha no meio da transação'));
    return callback(tx);
  });

  const prisma = {
    company: {
      findUnique: vi.fn(() => Promise.resolve(documentTaken ? { id: 'outra' } : null)),
    },
    user: {
      findUnique: vi.fn(() => Promise.resolve(emailTaken ? { id: 'outro' } : null)),
    },
    plan: {
      findUnique: vi.fn(() => Promise.resolve(planExists ? { id: PLAN_ID } : null)),
    },
    $transaction: transaction,
    db: {},
  } as unknown as PrismaService;

  const log = vi.fn((_entry: { action: string; diff?: unknown }) => Promise.resolve());
  const audit = { log } as unknown as AuditService;

  const hashPassword = vi.fn(() => Promise.resolve('hash-argon2'));
  const passwordService = { hashPassword } as unknown as PasswordService;

  const config = { get: () => 20 } as unknown as ConfigService<Env, true>;

  return {
    service: new CompaniesService(prisma, config, audit, passwordService),
    tx,
    transaction,
    created,
    log,
    hashPassword,
  };
}

describe('CompaniesService.create — provisionamento (RF-20, RF-11)', () => {
  describe('empresa utilizável ou nenhuma', () => {
    it('cria empresa, os dois papéis, o admin e o vínculo', async () => {
      const { service, created } = createService();

      const result = await service.create(validDto);

      expect(created.company).toHaveLength(1);
      expect(created.role.map((r) => (r as { name: string }).name)).toEqual([
        'Admin',
        'Colaborador',
      ]);
      expect(created.user).toHaveLength(1);
      expect(created.userRole).toHaveLength(1);
      expect(result.adminUserId).toBe('user-1');
    });

    it('tudo acontece dentro de uma transação', async () => {
      const { service, transaction } = createService();

      await service.create(validDto);

      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('falha no meio não deixa empresa pela metade — o erro sobe', async () => {
      const { service } = createService({ transactionFails: true });

      await expect(service.create(validDto)).rejects.toThrow('falha no meio da transação');
    });

    it('o admin nasce obrigado a trocar a senha (RF-04)', async () => {
      const { service, created } = createService();

      await service.create(validDto);

      expect(created.user[0]).toMatchObject({ mustChangePassword: true });
    });

    it('a senha é gravada como hash, nunca em claro', async () => {
      const { service, created, hashPassword } = createService();

      await service.create(validDto);

      expect(hashPassword).toHaveBeenCalledWith('SenhaValida123!');
      expect(created.user[0]).toMatchObject({ passwordHash: 'hash-argon2' });
      expect(JSON.stringify(created.user[0])).not.toContain('SenhaValida123!');
    });

    it('concede permissões aos dois papéis', async () => {
      const { service, created } = createService();

      await service.create(validDto);

      expect(created.rolePermission.length).toBeGreaterThan(0);
    });

    it('catálogo de permissões vazio derruba o provisionamento em vez de criar Admin inútil', async () => {
      // Banco sem seed. Antes desta trava a empresa nascia com papéis vazios e
      // o admin logava sem conseguir fazer nada — falha silenciosa.
      const { service, created } = createService({ emptyPermissionCatalog: true });

      const thrown = await capture(() => service.create(validDto));

      expect(thrown.code).toBe('PERMISSAO_INEXISTENTE');
      expect(created.rolePermission).toHaveLength(0);
    });
  });

  describe('assinatura', () => {
    it('sem planId, a empresa nasce sem assinatura (docs/04: ausência não é inadimplência)', async () => {
      const { service, created } = createService();

      await service.create(validDto);

      expect(created.subscription).toHaveLength(0);
    });

    it('com planId, cria a assinatura ativa', async () => {
      const { service, created } = createService();

      await service.create({ ...validDto, planId: PLAN_ID });

      expect(created.subscription).toHaveLength(1);
      expect(created.subscription[0]).toMatchObject({ planId: PLAN_ID, status: 'ACTIVE' });
    });

    it('plano inexistente responde 404 antes de criar qualquer coisa', async () => {
      const { service, created } = createService({ planExists: false });

      const thrown = await capture(() => service.create({ ...validDto, planId: PLAN_ID }));

      expect(thrown.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(created.company).toHaveLength(0);
    });
  });

  describe('conflitos', () => {
    it('documento já cadastrado responde 409 e não gasta o hash de senha', async () => {
      const { service, created, hashPassword } = createService({ documentTaken: true });

      const thrown = await capture(() => service.create(validDto));

      expect(thrown.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(created.company).toHaveLength(0);
      expect(hashPassword).not.toHaveBeenCalled();
    });

    it('e-mail do admin já cadastrado responde 409', async () => {
      const { service, created } = createService({ emailTaken: true });

      const thrown = await capture(() => service.create(validDto));

      expect(thrown.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(thrown.code).toBe('EMAIL_JA_CADASTRADO');
      expect(created.company).toHaveLength(0);
    });
  });

  describe('auditoria (RNF-06)', () => {
    it('registra company.provisioned com autor e o admin criado', async () => {
      const { service, log } = createService();

      await service.create(validDto, 'super-admin-id', '203.0.113.10');

      const entry = log.mock.calls[0]?.[0];
      expect(entry?.action).toBe('company.provisioned');
      expect(entry?.diff).toMatchObject({ adminUserId: 'user-1', adminEmail: validDto.adminEmail });
    });

    it('a senha do admin nunca entra na trilha', async () => {
      const { service, log } = createService();

      await service.create(validDto);

      expect(JSON.stringify(log.mock.calls[0]?.[0])).not.toContain(validDto.adminPassword);
    });
  });
});
