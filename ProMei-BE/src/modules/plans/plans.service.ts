import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Plan } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BusinessException, BusinessErrorCode } from '../../shared/errors';
import type { Env } from '../../shared/config';
import { resolvePagination } from '../../shared/pagination';
import { AuditService } from '../audit/audit.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

const PLAN_IN_USE_PRISMA_CODE = 'P2003';

const PLANS_RESOURCE = 'plans';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreatePlanDto, actorId?: string, ip?: string): Promise<Plan> {
    const plan = await this.prisma.db.plan.create({
      data: { ...dto, limits: dto.limits as unknown as Prisma.InputJsonValue },
    });

    await this.audit.log({
      action: 'plan.created',
      resource: PLANS_RESOURCE,
      userId: actorId,
      diff: { planId: plan.id, name: plan.name, limits: { ...dto.limits } },
      ip,
    });

    return plan;
  }

  async findAll(requestedPage?: number, requestedLimit?: number): Promise<PaginatedResult<Plan>> {
    const { page, limit, skip } = resolvePagination(this.config, requestedPage, requestedLimit);

    const [data, total] = await Promise.all([
      this.prisma.db.plan.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.db.plan.count(),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Plan> {
    const plan = await this.prisma.db.plan.findUnique({ where: { id } });
    if (!plan) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Plano não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
    return plan;
  }

  async update(id: string, dto: UpdatePlanDto, actorId?: string, ip?: string): Promise<Plan> {
    const before = await this.findOne(id);

    const plan = await this.prisma.db.plan.update({
      where: { id },
      data: { ...dto, limits: dto.limits as unknown as Prisma.InputJsonValue },
    });

    // Mudanca de limite afeta todas as empresas no plano (RN-14): o antes e
    // depois precisa ficar registrado.
    await this.audit.log({
      action: 'plan.updated',
      resource: PLANS_RESOURCE,
      userId: actorId,
      diff: {
        planId: id,
        before: { name: before.name, limits: before.limits as Prisma.InputJsonValue },
        after: { name: dto.name ?? null, limits: dto.limits ? { ...dto.limits } : null },
      },
      ip,
    });

    return plan;
  }

  async remove(id: string, actorId?: string, ip?: string): Promise<void> {
    const plan = await this.findOne(id);
    try {
      await this.prisma.db.plan.delete({ where: { id } });

      await this.audit.log({
        action: 'plan.deleted',
        resource: PLANS_RESOURCE,
        userId: actorId,
        diff: { planId: id, name: plan.name },
        ip,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PLAN_IN_USE_PRISMA_CODE
      ) {
        throw new BusinessException(
          BusinessErrorCode.VALIDACAO_FALHOU,
          'Plano não pode ser excluído: existem assinaturas vinculadas a ele',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }
}
