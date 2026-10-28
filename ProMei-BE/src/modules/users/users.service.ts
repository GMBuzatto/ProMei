import { HttpStatus, Injectable } from '@nestjs/common';
import { UserStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BusinessErrorCode, BusinessException } from '../../shared/errors';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { PermissionsService } from '../permissions';
import { ADMIN_ROLE } from '../roles/roles.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { UserResponseDto } from './dto/user-response.dto';
import { exceedsLimit, parsePlanLimits } from './plan-limits';

const USERS_RESOURCE = 'users';

interface UserWithRoles {
  id: string;
  email: string;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: Date;
  companyId: string | null;
  roles?: { role: { id: string; name: string } }[];
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly audit: AuditService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async list(companyId: string): Promise<UserResponseDto[]> {
    const users = (await this.prisma.db.user.findMany({
      where: { companyId },
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: 'asc' },
    })) as unknown as UserWithRoles[];

    return users.map((user) => this.toResponse(user));
  }

  async findById(id: string, companyId: string): Promise<UserResponseDto> {
    return this.toResponse(await this.findOrFail(id, companyId));
  }

  /**
   * RN-14: o limite de usuários do plano é validado na criação.
   * Só usuários ATIVOS ocupam vaga — desativar alguém libera espaço sem apagar
   * o histórico dele.
   */
  async create(
    companyId: string,
    dto: CreateUserDto,
    actorId?: string,
    ip?: string,
  ): Promise<UserResponseDto> {
    await this.ensureEmailAvailable(dto.email);
    await this.ensurePlanLimit(companyId);

    const user = (await this.prisma.db.user.create({
      data: {
        companyId,
        email: dto.email,
        passwordHash: await this.passwordService.hashPassword(dto.password),
        // Senha definida por outra pessoa: troca obrigatória no primeiro acesso (RF-04).
        mustChangePassword: true,
      },
    })) as unknown as UserWithRoles;

    if (dto.roleId) {
      await this.attachRole(user.id, dto.roleId, companyId);
    }

    await this.audit.log({
      action: 'user.created',
      resource: USERS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { targetUserId: user.id, email: dto.email, roleId: dto.roleId },
      ip,
    });

    return this.findById(user.id, companyId);
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateUserDto,
    actorId?: string,
    ip?: string,
  ): Promise<UserResponseDto> {
    const existing = await this.findOrFail(id, companyId);

    if (dto.email && dto.email !== existing.email) {
      await this.ensureEmailAvailable(dto.email);
    }

    // Reativar consome vaga: precisa caber no plano.
    if (dto.status === UserStatus.ACTIVE && existing.status !== UserStatus.ACTIVE) {
      await this.ensurePlanLimit(companyId);
    }

    if (dto.status === UserStatus.INACTIVE && existing.status === UserStatus.ACTIVE) {
      await this.ensureNotLastAdmin(id, companyId);
    }

    await this.prisma.db.user.update({
      where: { id },
      data: {
        ...(dto.email ? { email: dto.email } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });

    await this.audit.log({
      action: 'user.updated',
      resource: USERS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { targetUserId: id, ...dto },
      ip,
    });

    return this.findById(id, companyId);
  }

  /**
   * Desativa em vez de excluir: usuário tem movimentações e trilha de auditoria
   * apontando para ele (RN-22 trata movimentação como imutável).
   */
  async deactivate(id: string, companyId: string, actorId?: string, ip?: string): Promise<void> {
    const user = await this.findOrFail(id, companyId);

    if (user.status === UserStatus.INACTIVE) return;

    await this.ensureNotLastAdmin(id, companyId);

    await this.prisma.db.user.update({
      where: { id },
      data: { status: UserStatus.INACTIVE },
    });

    this.permissionsService.invalidateCache();

    await this.audit.log({
      action: 'user.deactivated',
      resource: USERS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { targetUserId: id },
      ip,
    });
  }

  /** RN-04: a empresa precisa manter ao menos um Admin ativo. */
  private async ensureNotLastAdmin(userId: string, companyId: string): Promise<void> {
    const adminRole = await this.prisma.db.role.findFirst({
      where: { companyId, name: ADMIN_ROLE },
    });

    if (!adminRole) return;

    const isAdmin = await this.prisma.db.userRole.count({
      where: { userId, roleId: adminRole.id },
    });

    if (isAdmin === 0) return;

    const activeAdmins = await this.prisma.db.user.count({
      where: {
        companyId,
        status: UserStatus.ACTIVE,
        roles: { some: { roleId: adminRole.id } },
      },
    });

    if (activeAdmins <= 1) {
      throw new BusinessException(
        BusinessErrorCode.ULTIMO_ADMIN,
        'A company precisa manter ao menos um Admin ativo',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async ensurePlanLimit(companyId: string): Promise<void> {
    const subscription = (await this.prisma.db.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    })) as { plan: { limits: unknown; name: string } } | null;

    // Sem assinatura não há limite a aplicar — o bloqueio de escrita nesse caso
    // é responsabilidade da tabela de decisão de acesso, não daqui.
    if (!subscription) return;

    const { maxUsers } = parsePlanLimits(subscription.plan.limits);
    const activeCount = await this.prisma.db.user.count({
      where: { companyId, status: UserStatus.ACTIVE },
    });

    if (exceedsLimit(activeCount, maxUsers)) {
      throw new BusinessException(
        BusinessErrorCode.LIMITE_PLANO_EXCEDIDO,
        `O plan ${subscription.plan.name} permite ${String(maxUsers)} usuários activeCount`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async ensureEmailAvailable(email: string): Promise<void> {
    // E-mail é único globalmente (schema), então a checagem ignora o tenant.
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new BusinessException(
        BusinessErrorCode.EMAIL_JA_CADASTRADO,
        'Já existe um usuário com este e-mail',
        HttpStatus.CONFLICT,
      );
    }
  }

  private async attachRole(userId: string, roleId: string, companyId: string): Promise<void> {
    const role = await this.prisma.db.role.findFirst({ where: { id: roleId, companyId } });

    if (!role) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Role not found',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.db.userRole.create({ data: { userId, roleId } });
    this.permissionsService.invalidateCache();
  }

  private async findOrFail(id: string, companyId: string): Promise<UserWithRoles> {
    const user = (await this.prisma.db.user.findFirst({
      where: { id, companyId },
      include: { roles: { include: { role: true } } },
    })) as unknown as UserWithRoles | null;

    if (!user) {
      throw new BusinessException(
        BusinessErrorCode.USUARIO_NAO_ENCONTRADO,
        'User not found',
        HttpStatus.NOT_FOUND,
      );
    }

    return user;
  }

  private toResponse(user: UserWithRoles): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      roles: (user.roles ?? []).map((link) => link.role.name),
      createdAt: user.createdAt,
    };
  }
}
