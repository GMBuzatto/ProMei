import { HttpStatus } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsGuard } from '../../src/shared/guards/permissions.guard';
import type { PermissionsService } from '../../src/modules/permissions';
import type { AuthenticatedUser } from '../../src/shared/logging';
import type { BusinessException } from '../../src/shared/errors';

interface Metadata {
  isPublic?: boolean;
  requiredPermissions?: string[];
  isPlatformRoute?: boolean;
  isAnyAuthenticatedRoute?: boolean;
}

function createGuard(metadata: Metadata, grantedPermissions: string[] = []) {
  const reflector = {
    getAllAndOverride: vi.fn((key: string) => (metadata as Record<string, unknown>)[key]),
  } as unknown as Reflector;

  const getPermissionsForRoles = vi.fn(() => Promise.resolve(new Set(grantedPermissions)));
  const permissionsService = { getPermissionsForRoles } as unknown as PermissionsService;

  return { guard: new PermissionsGuard(reflector, permissionsService), getPermissionsForRoles };
}

function createContext(user?: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

const companyUser: AuthenticatedUser = {
  sub: 'u1',
  company_id: 'company-a',
  roles: ['Admin'],
};
const platformUser: AuthenticatedUser = {
  sub: 'staff-1',
  company_id: null,
  roles: ['Staff'],
};
const superAdmin: AuthenticatedUser = {
  sub: 'sa-1',
  company_id: null,
  roles: ['Super Admin'],
};

async function captureError(fn: () => Promise<unknown>): Promise<BusinessException> {
  try {
    await fn();
    throw new Error('deveria ter lançado');
  } catch (error) {
    return error as BusinessException;
  }
}

describe('PermissionsGuard (RF-13)', () => {
  it('libera rota pública', async () => {
    const { guard } = createGuard({ isPublic: true });
    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it('exige autenticação quando não há usuário', async () => {
    const { guard } = createGuard({});
    const thrown = await captureError(() => guard.canActivate(createContext()));
    expect(thrown.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  });

  describe('permissão recurso:ação', () => {
    it('nega com 403 e código de negócio quando falta a permissão', async () => {
      const { guard } = createGuard({ requiredPermissions: ['items:create'] }, ['items:read']);

      const thrown = await captureError(() => guard.canActivate(createContext(companyUser)));

      expect(thrown.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(thrown.code).toBe('PERMISSAO_NEGADA');
    });

    it('permite quando o papel tem a permissão', async () => {
      const { guard } = createGuard({ requiredPermissions: ['items:create'] }, ['items:create']);
      await expect(guard.canActivate(createContext(companyUser))).resolves.toBe(true);
    });

    it('exige TODAS as permissões declaradas', async () => {
      const { guard } = createGuard({ requiredPermissions: ['items:create', 'items:delete'] }, [
        'items:create',
      ]);

      const thrown = await captureError(() => guard.canActivate(createContext(companyUser)));
      expect(thrown.message).toContain('items:delete');
    });

    it('rota sem @RequirePermission não exige permissão', async () => {
      const { guard, getPermissionsForRoles } = createGuard({});
      await expect(guard.canActivate(createContext(companyUser))).resolves.toBe(true);
      expect(getPermissionsForRoles).not.toHaveBeenCalled();
    });

    it('Super Admin dispensa a checagem de permissão (RN-01)', async () => {
      const { guard, getPermissionsForRoles } = createGuard(
        { requiredPermissions: ['items:delete'], isPlatformRoute: true },
        [],
      );

      await expect(guard.canActivate(createContext(superAdmin))).resolves.toBe(true);
      expect(getPermissionsForRoles).not.toHaveBeenCalled();
    });

    it('Staff NÃO dispensa: passa pelo fluxo normal de permissões (RN-01)', async () => {
      const { guard } = createGuard(
        { requiredPermissions: ['users:delete'], isPlatformRoute: true },
        [],
      );

      const thrown = await captureError(() => guard.canActivate(createContext(platformUser)));
      expect(thrown.code).toBe('PERMISSAO_NEGADA');
    });
  });

  describe('fronteira plataforma / tenant', () => {
    it('usuário de empresa em rota de plataforma recebe 404', async () => {
      const { guard } = createGuard({ isPlatformRoute: true });

      const thrown = await captureError(() => guard.canActivate(createContext(companyUser)));

      expect(thrown.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(thrown.code).toBe('RECURSO_NAO_ENCONTRADO');
    });

    it('usuário de plataforma em rota de tenant recebe 404', async () => {
      const { guard } = createGuard({});

      const thrown = await captureError(() => guard.canActivate(createContext(platformUser)));

      expect(thrown.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(thrown.code).toBe('RECURSO_NAO_ENCONTRADO');
    });

    it('o default é rota de tenant — esquecer o decorator fecha, não abre', async () => {
      const { guard } = createGuard({});
      await expect(guard.canActivate(createContext(companyUser))).resolves.toBe(true);
      await expect(guard.canActivate(createContext(superAdmin))).rejects.toBeDefined();
    });

    it('@AnyAuthenticated aceita os dois tipos de usuário', async () => {
      const { guard } = createGuard({ isAnyAuthenticatedRoute: true });

      await expect(guard.canActivate(createContext(companyUser))).resolves.toBe(true);
      await expect(guard.canActivate(createContext(platformUser))).resolves.toBe(true);
    });
  });
});
