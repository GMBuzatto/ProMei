import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BusinessErrorCode, BusinessException } from '../../shared/errors';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions';
import type { RoleResponseDto } from './dto/role-response.dto';

const ROLES_RESOURCE = 'roles';

/** Papel de empresa com acesso administrativo (RN-02, RN-04). */
export const ADMIN_ROLE = 'Admin';

interface RoleWithPermissions {
  id: string;
  name: string;
  isSystem: boolean;
  companyId: string | null;
  permissions?: { permission: { resource: string; action: string } }[];
  users?: unknown[];
  _count?: { users: number };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async list(companyId: string | null | undefined): Promise<RoleResponseDto[]> {
    const roles = (await this.prisma.db.role.findMany({
      where: { companyId: companyId ?? null },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    })) as unknown as RoleWithPermissions[];

    return roles.map((role) => this.toResponse(role));
  }

  async findById(id: string, companyId: string | null | undefined): Promise<RoleResponseDto> {
    const role = await this.findOrFail(id, companyId);
    return this.toResponse(role);
  }

  async create(
    companyId: string,
    name: string,
    permissions: string[],
    actorId?: string,
    ip?: string,
  ): Promise<RoleResponseDto> {
    await this.ensureNameAvailable(companyId, name);
    const permissionIds = await this.resolvePermissions(permissions);

    const role = (await this.prisma.db.role.create({
      data: {
        companyId,
        name,
        isSystem: false,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
      include: { permissions: { include: { permission: true } } },
    })) as unknown as RoleWithPermissions;

    this.permissionsService.invalidateCache();

    await this.audit.log({
      action: 'role.created',
      resource: ROLES_RESOURCE,
      userId: actorId,
      companyId,
      diff: { roleId: role.id, name, permissions },
      ip,
    });

    return this.toResponse(role);
  }

  async update(
    id: string,
    companyId: string | null | undefined,
    data: { name?: string; permissions?: string[] },
    actorId?: string,
    ip?: string,
  ): Promise<RoleResponseDto> {
    const existing = await this.findOrFail(id, companyId);
    this.rejectIfSystemRole(existing, 'alterado');

    if (data.name && data.name !== existing.name) {
      await this.ensureNameAvailable(companyId ?? null, data.name);
    }

    if (data.permissions) {
      const permissionIds = await this.resolvePermissions(data.permissions);
      // Substitui o conjunto inteiro: mais previsível que merge parcial.
      await this.prisma.db.rolePermission.deleteMany({ where: { roleId: id } });
      await this.prisma.db.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
      });
    }

    if (data.name) {
      await this.prisma.db.role.update({ where: { id }, data: { name: data.name } });
    }

    this.permissionsService.invalidateCache();

    await this.audit.log({
      action: 'role.updated',
      resource: ROLES_RESOURCE,
      userId: actorId,
      companyId: existing.companyId,
      diff: { roleId: id, ...data },
      ip,
    });

    return this.findById(id, companyId);
  }

  async remove(
    id: string,
    companyId: string | null | undefined,
    actorId?: string,
    ip?: string,
  ): Promise<void> {
    const role = await this.findOrFail(id, companyId);
    this.rejectIfSystemRole(role, 'excluído');

    // Cascata: o schema remove os vínculos (onDelete: Cascade). Usuários que
    // tinham só este papel ficam sem permissão alguma — é o comportamento
    // escolhido, e o audit registra quantos foram afetados.
    const affectedUsers = role._count?.users ?? 0;

    await this.prisma.db.role.delete({ where: { id } });
    this.permissionsService.invalidateCache();

    await this.audit.log({
      action: 'role.deleted',
      resource: ROLES_RESOURCE,
      userId: actorId,
      companyId: role.companyId,
      diff: { roleId: id, name: role.name, affectedUsers },
      ip,
    });
  }

  /** RN-04: atribuir papel a um usuário da empresa. */
  async assignToUser(
    userId: string,
    roleId: string,
    companyId: string | null | undefined,
    actorId?: string,
    ip?: string,
  ): Promise<void> {
    const role = await this.findOrFail(roleId, companyId);
    await this.ensureUserBelongsToCompany(userId, companyId);

    await this.prisma.db.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
    });

    this.permissionsService.invalidateCache();

    await this.audit.log({
      action: 'role.assigned',
      resource: ROLES_RESOURCE,
      userId: actorId,
      companyId: role.companyId,
      diff: { targetUserId: userId, roleId, roleName: role.name },
      ip,
    });
  }

  /**
   * RN-04: a empresa precisa manter ao menos 1 Admin. Remover o papel Admin do
   * último administrador é recusado — é a diferença entre uma empresa
   * administrável e uma empresa órfã.
   */
  async removeFromUser(
    userId: string,
    roleId: string,
    companyId: string | null | undefined,
    actorId?: string,
    ip?: string,
  ): Promise<void> {
    const role = await this.findOrFail(roleId, companyId);
    await this.ensureUserBelongsToCompany(userId, companyId);

    if (role.name === ADMIN_ROLE) {
      await this.ensureNotLastAdmin(roleId, userId);
    }

    await this.prisma.db.userRole.deleteMany({ where: { userId, roleId } });
    this.permissionsService.invalidateCache();

    await this.audit.log({
      action: 'role.unassigned',
      resource: ROLES_RESOURCE,
      userId: actorId,
      companyId: role.companyId,
      diff: { targetUserId: userId, roleId, roleName: role.name },
      ip,
    });
  }

  private async ensureNotLastAdmin(roleId: string, userId: string): Promise<void> {
    const totalAdmins = await this.prisma.db.userRole.count({ where: { roleId } });
    const userHasRole = await this.prisma.db.userRole.count({ where: { roleId, userId } });

    if (userHasRole > 0 && totalAdmins <= 1) {
      throw new BusinessException(
        BusinessErrorCode.ULTIMO_ADMIN,
        'A empresa precisa manter ao menos um Admin ativo',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async ensureUserBelongsToCompany(
    userId: string,
    companyId: string | null | undefined,
  ): Promise<void> {
    const user = await this.prisma.db.user.findFirst({
      where: { id: userId, companyId: companyId ?? null },
    });

    if (!user) {
      throw new BusinessException(
        BusinessErrorCode.USUARIO_NAO_ENCONTRADO,
        'User not found',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async findOrFail(
    id: string,
    companyId: string | null | undefined,
  ): Promise<RoleWithPermissions> {
    const role = (await this.prisma.db.role.findFirst({
      where: { id, companyId: companyId ?? null },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    })) as unknown as RoleWithPermissions | null;

    if (!role) {
      // 404 e não 403: papel de outra empresa não deve nem revelar existência.
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Role not found',
        HttpStatus.NOT_FOUND,
      );
    }

    return role;
  }

  private rejectIfSystemRole(role: RoleWithPermissions, operation: string): void {
    if (role.isSystem) {
      throw new BusinessException(
        BusinessErrorCode.PAPEL_DE_SISTEMA_IMUTAVEL,
        `Papel de sistema não pode ser ${operation}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async ensureNameAvailable(companyId: string | null, name: string): Promise<void> {
    const existing = await this.prisma.db.role.findFirst({ where: { companyId, name } });

    if (existing) {
      throw new BusinessException(
        BusinessErrorCode.PAPEL_JA_EXISTE,
        `Já existe um papel chamado "${name}" nesta empresa`,
        HttpStatus.CONFLICT,
      );
    }
  }

  /** Converte `recurso:ação` em ids, recusando permissão inexistente. */
  private async resolvePermissions(permissions: string[]): Promise<string[]> {
    if (permissions.length === 0) return [];

    const pairs = permissions.map((permission) => {
      const [resource, action] = permission.split(':');
      return { resource: resource as string, action: action as string };
    });

    const found = (await this.prisma.db.permission.findMany({
      where: { OR: pairs },
    })) as unknown as { id: string; resource: string; action: string }[];

    const foundKeys = new Set(
      found.map((permission) => `${permission.resource}:${permission.action}`),
    );
    const unknownOnes = permissions.filter((permission) => !foundKeys.has(permission));

    if (unknownOnes.length > 0) {
      throw new BusinessException(
        BusinessErrorCode.PERMISSAO_INEXISTENTE,
        `Permissões desconhecidas: ${unknownOnes.join(', ')}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return found.map((permission) => permission.id);
  }

  private toResponse(role: RoleWithPermissions): RoleResponseDto {
    return {
      id: role.id,
      name: role.name,
      isSystem: role.isSystem,
      permissions: (role.permissions ?? []).map(
        (grant) => `${grant.permission.resource}:${grant.permission.action}`,
      ),
      ...(role._count ? { usersCount: role._count.users } : {}),
    };
  }
}
