import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RolesService } from '../../src/modules/roles/roles.service';
import type { AuditService } from '../../src/modules/audit/audit.service';
import type { PermissionsService } from '../../src/modules/permissions';
import type { PrismaService } from '../../src/shared/prisma';
import type { BusinessException } from '../../src/shared/errors';

const COMPANY = 'company-a';

interface RoleFake {
  id: string;
  name: string;
  isSystem: boolean;
  companyId: string | null;
  permissions?: { permission: { resource: string; action: string } }[];
  _count?: { users: number };
}

const customRole: RoleFake = {
  id: 'role-1',
  name: 'Estoquista',
  isSystem: false,
  companyId: COMPANY,
  permissions: [{ permission: { resource: 'items', action: 'read' } }],
  _count: { users: 0 },
};

const systemRole: RoleFake = {
  ...customRole,
  id: 'role-sys',
  name: 'Admin',
  isSystem: true,
};

function createService(
  options: {
    role?: RoleFake | null;
    nameAlreadyUsed?: boolean;
    knownPermissions?: { id: string; resource: string; action: string }[];
    totalWithRole?: number;
    userExists?: boolean;
  } = {},
) {
  const {
    role = customRole,
    nameAlreadyUsed = false,
    knownPermissions = [{ id: 'p1', resource: 'items', action: 'read' }],
    totalWithRole = 2,
    userExists = true,
  } = options;

  const roleDelegate = {
    findFirst: vi.fn((args: { where?: { name?: string } }) =>
      Promise.resolve(args?.where?.name && nameAlreadyUsed ? customRole : role),
    ),
    findMany: vi.fn(() => Promise.resolve([systemRole, customRole])),
    create: vi.fn(() => Promise.resolve(customRole)),
    update: vi.fn(() => Promise.resolve(customRole)),
    delete: vi.fn(() => Promise.resolve(customRole)),
  };

  const userRoleDelegate = {
    upsert: vi.fn(() => Promise.resolve({})),
    deleteMany: vi.fn(() => Promise.resolve({ count: 1 })),
    count: vi.fn(() => Promise.resolve(totalWithRole)),
  };

  const prisma = {
    db: {
      role: roleDelegate,
      userRole: userRoleDelegate,
      rolePermission: {
        deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
        createMany: vi.fn(() => Promise.resolve({ count: 1 })),
      },
      permission: { findMany: vi.fn(() => Promise.resolve(knownPermissions)) },
      user: {
        findFirst: vi.fn(() => Promise.resolve(userExists ? { id: 'user-1' } : null)),
      },
    },
  } as unknown as PrismaService;

  // Tipar o parametro faz `log.mock.calls` virar tupla util nas asserções.
  const log = vi.fn((_entry: { action: string; diff?: unknown }) => Promise.resolve());
  const invalidateCache = vi.fn();

  const service = new RolesService(
    prisma,
    { log } as unknown as AuditService,
    { invalidateCache } as unknown as PermissionsService,
  );

  return { service, roleDelegate, userRoleDelegate, log, invalidateCache };
}

async function capture(fn: () => Promise<unknown>): Promise<BusinessException> {
  try {
    await fn();
    throw new Error('deveria ter lançado');
  } catch (error) {
    return error as BusinessException;
  }
}

describe('RolesService (RF-12 / RN-04)', () => {
  describe('papéis de sistema são imutáveis', () => {
    it('recusa alterar papel de sistema', async () => {
      const { service } = createService({ role: systemRole });

      const error = await capture(() => service.update('role-sys', COMPANY, { name: 'Outro' }));

      expect(error.code).toBe('PAPEL_DE_SISTEMA_IMUTAVEL');
      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('recusa excluir papel de sistema', async () => {
      const { service, roleDelegate } = createService({ role: systemRole });

      const error = await capture(() => service.remove('role-sys', COMPANY));

      expect(error.code).toBe('PAPEL_DE_SISTEMA_IMUTAVEL');
      expect(roleDelegate.delete).not.toHaveBeenCalled();
    });

    it('recusa alterar as permissões de papel de sistema', async () => {
      const { service } = createService({ role: systemRole });

      const error = await capture(() =>
        service.update('role-sys', COMPANY, { permissions: ['items:read'] }),
      );

      expect(error.code).toBe('PAPEL_DE_SISTEMA_IMUTAVEL');
    });
  });

  describe('RN-04 — último Admin', () => {
    it('recusa remover o papel Admin do último administrador', async () => {
      const { service, userRoleDelegate } = createService({
        role: { ...systemRole, name: 'Admin' },
        totalWithRole: 1,
      });

      const error = await capture(() => service.removeFromUser('user-1', 'role-sys', COMPANY));

      expect(error.code).toBe('ULTIMO_ADMIN');
      expect(error.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(userRoleDelegate.deleteMany).not.toHaveBeenCalled();
    });

    it('permite remover quando há outro Admin', async () => {
      const { service, userRoleDelegate } = createService({
        role: { ...systemRole, name: 'Admin' },
        totalWithRole: 2,
      });

      await service.removeFromUser('user-1', 'role-sys', COMPANY);

      expect(userRoleDelegate.deleteMany).toHaveBeenCalled();
    });

    it('a regra não afeta papéis que não sejam Admin', async () => {
      const { service, userRoleDelegate } = createService({
        role: customRole,
        totalWithRole: 1,
      });

      await service.removeFromUser('user-1', 'role-1', COMPANY);

      expect(userRoleDelegate.deleteMany).toHaveBeenCalled();
    });
  });

  describe('criação', () => {
    it('recusa nome já usado na empresa', async () => {
      const { service } = createService({ nameAlreadyUsed: true });

      const error = await capture(() => service.create(COMPANY, 'Estoquista', ['items:read']));

      expect(error.code).toBe('PAPEL_JA_EXISTE');
      expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('recusa permissão inexistente', async () => {
      const { service } = createService({ role: null, knownPermissions: [] });

      const error = await capture(() => service.create(COMPANY, 'Novo', ['items:voar']));

      expect(error.code).toBe('PERMISSAO_INEXISTENTE');
      expect(error.message).toContain('items:voar');
    });

    it('cria papel customizado e invalida o cache de permissões', async () => {
      const { service, roleDelegate, invalidateCache } = createService({ role: null });

      await service.create(COMPANY, 'Estoquista', ['items:read']);

      expect(roleDelegate.create).toHaveBeenCalled();
      expect(invalidateCache).toHaveBeenCalled();
    });

    it('registra a criação no audit', async () => {
      const { service, log } = createService({ role: null });

      await service.create(COMPANY, 'Estoquista', ['items:read'], 'admin-1');

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'role.created', userId: 'admin-1' }),
      );
    });
  });

  describe('escopo de tenant', () => {
    it('papel de outra empresa responde 404, não 403', async () => {
      const { service } = createService({ role: null });

      const error = await capture(() => service.findById('role-de-outra', COMPANY));

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(error.code).toBe('RECURSO_NAO_ENCONTRADO');
    });

    it('atribuir papel a usuário de outra empresa responde 404', async () => {
      const { service } = createService({ userExists: false });

      const error = await capture(() => service.assignToUser('user-x', 'role-1', COMPANY));

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('listagem', () => {
    it('devolve permissões no formato recurso:ação', async () => {
      const { service } = createService();

      const roles = await service.list(COMPANY);

      expect(roles[1]?.permissions).toEqual(['items:read']);
      expect(roles[0]?.isSystem).toBe(true);
    });
  });

  describe('exclusão em cascata', () => {
    it('exclui e registra quantos usuários foram afetados', async () => {
      const { service, roleDelegate, log } = createService({
        role: { ...customRole, _count: { users: 3 } },
      });

      await service.remove('role-1', COMPANY, 'admin-1');

      expect(roleDelegate.delete).toHaveBeenCalled();
      const entry = log.mock.calls[0]?.[0];
      expect(entry?.action).toBe('role.deleted');
      expect(entry?.diff).toMatchObject({ affectedUsers: 3 });
    });
  });
});
