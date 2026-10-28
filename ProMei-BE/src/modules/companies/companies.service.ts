import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CompanyStatus,
  SubscriptionStatus,
  type Company,
  type Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BusinessException, BusinessErrorCode } from '../../shared/errors';
import type { Env } from '../../shared/config';
import { resolvePagination } from '../../shared/pagination';
import {
  ADMIN_ROLE_NAME,
  COLLABORATOR_ROLE_NAME,
  adminPermissionMatcher,
  collaboratorPermissionPairs,
} from '../../shared/access/default-company-roles';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * O que o provisionamento devolve. Os ids dos papéis voltam para quem chamou
 * conseguir criar colaboradores em seguida sem ter que descobrir o papel.
 */
export interface ProvisionedCompany {
  company: Company;
  adminUserId: string;
  adminRoleId: string;
  collaboratorRoleId: string;
}

/** RN-11: únicas transições permitidas para o estado da empresa. */
const ALLOWED_STATUS_TRANSITIONS: Record<CompanyStatus, CompanyStatus[]> = {
  [CompanyStatus.ACTIVE]: [CompanyStatus.SUSPENDED, CompanyStatus.CANCELED],
  [CompanyStatus.SUSPENDED]: [CompanyStatus.ACTIVE],
  [CompanyStatus.CANCELED]: [],
};

const COMPANIES_RESOURCE = 'companies';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Provisiona uma empresa utilizável (RF-20): empresa + papéis Admin e
   * Colaborador com suas permissões (RF-11) + primeiro usuário admin +, se
   * houver plano, a assinatura.
   *
   * **Tudo numa transação.** Antes disto o `create` gravava só a linha em
   * `companies`, e nenhuma rota conseguia criar o primeiro usuário dela —
   * `POST /users` e `POST /roles` são de tenant, e o Super Admin leva 404 na
   * fronteira do `PermissionsGuard`. A empresa nascia inacessível e só saía
   * desse estado com acesso direto ao banco.
   *
   * A transação é o que garante que não existe meia-empresa: se o papel Admin
   * falhar, a empresa não fica criada esperando conserto manual.
   */
  async create(dto: CreateCompanyDto, actorId?: string, ip?: string): Promise<ProvisionedCompany> {
    await this.ensureDocumentAvailable(dto.document);
    await this.ensureEmailAvailable(dto.adminEmail);

    if (dto.planId) {
      await this.ensurePlanExists(dto.planId);
    }

    // Hash fora da transação: argon2 é deliberadamente lento (docs/09), e
    // segurar uma transação aberta durante ele desperdiça conexão do pool.
    const passwordHash = await this.passwordService.hashPassword(dto.adminPassword);

    const provisioned = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: dto.name, document: dto.document, segment: dto.segment },
      });

      const { adminRole, collaboratorRole } = await this.createDefaultRoles(tx, company.id);

      const admin = await tx.user.create({
        data: {
          companyId: company.id,
          email: dto.adminEmail,
          passwordHash,
          // Senha definida por outra pessoa: troca obrigatória no primeiro
          // acesso (RF-04).
          mustChangePassword: true,
        },
      });

      await tx.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });

      if (dto.planId) {
        await tx.subscription.create({
          data: {
            companyId: company.id,
            planId: dto.planId,
            status: SubscriptionStatus.ACTIVE,
            renewsAt: this.nextRenewalDate(),
          },
        });
      }

      return {
        company,
        adminUserId: admin.id,
        adminRoleId: adminRole.id,
        collaboratorRoleId: collaboratorRole.id,
      };
    });

    // Auditoria fora da transação: um erro ao auditar não pode desfazer o
    // provisionamento, e o registro precisa sobreviver a falhas posteriores
    // (mesma razão do ADR-0003).
    await this.audit.log({
      action: 'company.provisioned',
      resource: COMPANIES_RESOURCE,
      userId: actorId,
      companyId: provisioned.company.id,
      diff: {
        name: provisioned.company.name,
        document: provisioned.company.document,
        segment: provisioned.company.segment,
        adminUserId: provisioned.adminUserId,
        adminEmail: dto.adminEmail,
        planId: dto.planId ?? null,
      },
      ip,
    });

    return provisioned;
  }

  /**
   * Papéis padrão da empresa. A lista de permissões vem de
   * `shared/access/default-company-roles`, compartilhada com o seed — empresa
   * criada por API e por seed precisa nascer igual.
   */
  private async createDefaultRoles(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<{ adminRole: { id: string }; collaboratorRole: { id: string } }> {
    const [adminRole, collaboratorRole] = await Promise.all([
      tx.role.create({ data: { companyId, name: ADMIN_ROLE_NAME, isSystem: true } }),
      tx.role.create({ data: { companyId, name: COLLABORATOR_ROLE_NAME, isSystem: true } }),
    ]);

    const { fullResources, readOnlyResources } = adminPermissionMatcher();
    const adminPermissions = await tx.permission.findMany({
      where: {
        OR: [
          { resource: { in: fullResources } },
          { resource: { in: readOnlyResources }, action: 'read' },
        ],
      },
    });

    /**
     * Catálogo vazio significa banco sem seed de permissões. Sem esta trava o
     * provisionamento seguiria em silêncio e entregaria uma empresa cujo Admin
     * loga e não consegue fazer nada — meia-empresa com outro rosto, que é
     * justamente o que este método existe para impedir. Falhar aqui derruba a
     * transação inteira.
     */
    if (adminPermissions.length === 0) {
      throw new BusinessException(
        BusinessErrorCode.PERMISSAO_INEXISTENTE,
        'Permission catalog is empty: run the database seed before provisioning companies',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const collaboratorPairs = collaboratorPermissionPairs();
    const collaboratorPermissions = await tx.permission.findMany({
      where: { OR: collaboratorPairs },
    });

    await tx.rolePermission.createMany({
      data: [
        ...adminPermissions.map((permission) => ({
          roleId: adminRole.id,
          permissionId: permission.id,
        })),
        ...collaboratorPermissions.map((permission) => ({
          roleId: collaboratorRole.id,
          permissionId: permission.id,
        })),
      ],
    });

    return { adminRole, collaboratorRole };
  }

  private async ensureDocumentAvailable(document: string): Promise<void> {
    const existing = await this.prisma.company.findUnique({ where: { document } });
    if (existing) {
      throw new BusinessException(
        BusinessErrorCode.VALIDACAO_FALHOU,
        'A company with this document already exists',
        HttpStatus.CONFLICT,
      );
    }
  }

  /**
   * E-mail é único global (uma pessoa pertence a uma empresa só). Conferir
   * antes evita gastar o hash de argon2 e cair no índice único depois.
   */
  private async ensureEmailAvailable(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BusinessException(
        BusinessErrorCode.EMAIL_JA_CADASTRADO,
        'This email is already registered',
        HttpStatus.CONFLICT,
      );
    }
  }

  private async ensurePlanExists(planId: string): Promise<void> {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Plan not found',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  /** Primeira renovação: 30 dias. Ciclo real é responsabilidade do RF-23. */
  private nextRenewalDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date;
  }

  async findAll(
    requestedPage?: number,
    requestedLimit?: number,
  ): Promise<PaginatedResult<Company>> {
    const { page, limit, skip } = resolvePagination(this.config, requestedPage, requestedLimit);

    const [data, total] = await Promise.all([
      this.prisma.db.company.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.db.company.count(),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.prisma.db.company.findUnique({ where: { id } });
    if (!company) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Empresa não encontrada',
        HttpStatus.NOT_FOUND,
      );
    }
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto, actorId?: string, ip?: string): Promise<Company> {
    const before = await this.findOne(id);
    const company = await this.prisma.db.company.update({ where: { id }, data: dto });

    await this.audit.log({
      action: 'company.updated',
      resource: COMPANIES_RESOURCE,
      userId: actorId,
      companyId: id,
      // Antes e depois no mesmo registro: a trilha precisa responder "o que
      // mudou", nao apenas "algo mudou" (RNF-06).
      diff: {
        before: { name: before.name, segment: before.segment },
        after: { ...dto },
      },
      ip,
    });

    return company;
  }

  async updateStatus(
    id: string,
    nextStatus: CompanyStatus,
    actorId?: string,
    ip?: string,
  ): Promise<Company> {
    const company = await this.findOne(id);
    this.assertValidTransition(company.status, nextStatus);

    const updated = await this.prisma.db.company.update({
      where: { id },
      data: { status: nextStatus },
    });

    // Suspender ou cancelar empresa corta o acesso de todos os usuarios dela
    // (tabela de decisao, docs/04) — e das acoes mais sensiveis da plataforma.
    await this.audit.log({
      action: 'company.status_changed',
      resource: COMPANIES_RESOURCE,
      userId: actorId,
      companyId: id,
      diff: { from: company.status, to: nextStatus },
      ip,
    });

    return updated;
  }

  private assertValidTransition(current: CompanyStatus, next: CompanyStatus): void {
    const allowedNextStates = ALLOWED_STATUS_TRANSITIONS[current] ?? [];
    if (!allowedNextStates.includes(next)) {
      throw new BusinessException(
        BusinessErrorCode.TRANSICAO_INVALIDA,
        `Transição de estado inválida: ${current} -> ${next}`,
      );
    }
  }
}
