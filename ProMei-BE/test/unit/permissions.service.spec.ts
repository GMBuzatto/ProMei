import { describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '../../src/modules/permissions/permissions.service';
import type { PrismaService } from '../../src/shared/prisma';

interface RoleFake {
  name: string;
  companyId: string | null;
  permissions: { permission: { resource: string; action: string } }[];
}

const adminRole: RoleFake = {
  name: 'Admin',
  companyId: 'company-a',
  permissions: [
    { permission: { resource: 'items', action: 'create' } },
    { permission: { resource: 'items', action: 'read' } },
  ],
};

function createService(roles: RoleFake[] = [adminRole]) {
  let current = roles;

  const findMany = vi.fn(() => Promise.resolve(current));
  const permissionFindMany = vi.fn(() =>
    Promise.resolve([
      { resource: 'items', action: 'read' },
      { resource: 'items', action: 'create' },
    ]),
  );

  const prisma = {
    db: { role: { findMany }, permission: { findMany: permissionFindMany } },
  } as unknown as PrismaService;

  return {
    service: new PermissionsService(prisma),
    findMany,
    setRoles: (next: RoleFake[]) => {
      current = next;
    },
  };
}

describe('PermissionsService', () => {
  describe('resolução de permissões', () => {
    it('monta os pares recurso:ação a partir dos papéis', async () => {
      const { service } = createService();

      const permissions = await service.getPermissionsForRoles(['Admin'], 'company-a');

      expect([...permissions].sort()).toEqual(['items:create', 'items:read']);
    });

    it('sem papéis, devolve conjunto vazio sem ir ao banco', async () => {
      const { service, findMany } = createService();

      const permissions = await service.getPermissionsForRoles([], 'company-a');

      expect(permissions.size).toBe(0);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('papel sem permissão devolve conjunto vazio, não erro', async () => {
      const { service } = createService([
        { name: 'Vazio', companyId: 'company-a', permissions: [] },
      ]);

      const permissions = await service.getPermissionsForRoles(['Vazio'], 'company-a');

      expect(permissions.size).toBe(0);
    });
  });

  describe('cache', () => {
    it('segunda chamada não repete a query', async () => {
      const { service, findMany } = createService();

      await service.getPermissionsForRoles(['Admin'], 'company-a');
      await service.getPermissionsForRoles(['Admin'], 'company-a');

      expect(findMany).toHaveBeenCalledTimes(1);
    });

    it('a ordem dos papéis não cria entradas diferentes', async () => {
      const { service, findMany } = createService();

      await service.getPermissionsForRoles(['Admin', 'Colaborador'], 'company-a');
      await service.getPermissionsForRoles(['Colaborador', 'Admin'], 'company-a');

      expect(findMany).toHaveBeenCalledTimes(1);
    });

    it('empresas diferentes não compartilham cache — seria vazamento cross-tenant', async () => {
      const { service, findMany } = createService();

      await service.getPermissionsForRoles(['Admin'], 'company-a');
      await service.getPermissionsForRoles(['Admin'], 'company-b');

      expect(findMany).toHaveBeenCalledTimes(2);
    });

    it('usuário de plataforma tem chave própria, separada de empresa', async () => {
      const { service, findMany } = createService();

      await service.getPermissionsForRoles(['Super Admin'], null);
      await service.getPermissionsForRoles(['Super Admin'], 'company-a');

      expect(findMany).toHaveBeenCalledTimes(2);
    });

    it('invalidateCache força nova consulta — é o que faz revogação valer (RF-12)', async () => {
      const { service, findMany, setRoles } = createService();

      await service.getPermissionsForRoles(['Admin'], 'company-a');
      setRoles([
        {
          name: 'Admin',
          companyId: 'company-a',
          permissions: [{ permission: { resource: 'items', action: 'read' } }],
        },
      ]);
      service.invalidateCache();
      const after = await service.getPermissionsForRoles(['Admin'], 'company-a');

      expect(findMany).toHaveBeenCalledTimes(2);
      expect([...after]).toEqual(['items:read']);
    });

    it('sem invalidar, a permissão revogada continua valendo dentro do TTL', async () => {
      // Documenta a janela de 60s aceita de propósito: é por isso que quem mexe
      // em papéis precisa chamar invalidateCache().
      const { service, setRoles } = createService();

      await service.getPermissionsForRoles(['Admin'], 'company-a');
      setRoles([{ name: 'Admin', companyId: 'company-a', permissions: [] }]);
      const after = await service.getPermissionsForRoles(['Admin'], 'company-a');

      expect(after.size).toBe(2);
    });
  });

  describe('listAvailable', () => {
    it('devolve o catálogo no formato recurso:ação', async () => {
      const { service } = createService();

      expect(await service.listAvailable()).toEqual(['items:read', 'items:create']);
    });
  });
});
