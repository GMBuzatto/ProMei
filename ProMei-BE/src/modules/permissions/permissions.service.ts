import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

/** Papel de plataforma com acesso total (RN-01). */
export const SUPER_ADMIN_ROLE = 'Super Admin';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

/**
 * Resolve as permissões efetivas de um usuário a partir dos papéis.
 *
 * As permissões vêm do banco, não do token: revogar uma permissão precisa ter
 * efeito sem esperar o access token expirar. O cache de 60s evita uma query por
 * request sem abrir uma janela longa de inconsistência.
 */
@Injectable()
export class PermissionsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async getPermissionsForRoles(
    roleNames: string[],
    companyId: string | null | undefined,
  ): Promise<Set<string>> {
    if (roleNames.length === 0) return new Set();

    const cacheKey = `${companyId ?? 'platform'}:${[...roleNames].sort().join(',')}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    const roles = await this.prisma.db.role.findMany({
      where: { name: { in: roleNames }, companyId: companyId ?? null },
      include: { permissions: { include: { permission: true } } },
    });

    const permissions = new Set<string>();
    for (const role of roles) {
      const grants = (
        role as { permissions?: { permission: { resource: string; action: string } }[] }
      ).permissions;
      for (const grant of grants ?? []) {
        permissions.add(`${grant.permission.resource}:${grant.permission.action}`);
      }
    }

    this.cache.set(cacheKey, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
    return permissions;
  }

  /** Catálogo completo, no formato `recurso:ação`, para montar telas de papéis. */
  async listAvailable(): Promise<string[]> {
    const permissions = (await this.prisma.db.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    })) as unknown as { resource: string; action: string }[];

    return permissions.map((permission) => `${permission.resource}:${permission.action}`);
  }

  /** Invalidação explícita — usar ao alterar papéis ou permissões (RF-12). */
  invalidateCache(): void {
    this.cache.clear();
  }
}
