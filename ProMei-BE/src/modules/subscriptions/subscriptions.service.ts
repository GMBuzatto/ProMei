import { HttpStatus, Injectable } from '@nestjs/common';
import { SubscriptionStatus, type Subscription } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BusinessErrorCode, BusinessException } from '../../shared/errors';
import { SubscriptionAccessGuard } from '../../shared/access';
import { AuditService } from '../audit/audit.service';
import { canTransition } from './subscription-state';
import type { CreateSubscriptionDto } from './dto/create-subscription.dto';

const SUBSCRIPTIONS_RESOURCE = 'subscriptions';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accessGuard: SubscriptionAccessGuard,
  ) {}

  async findByCompany(companyId: string): Promise<Subscription> {
    const subscription = (await this.prisma.db.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    })) as Subscription | null;

    if (!subscription) {
      throw new BusinessException(
        BusinessErrorCode.ASSINATURA_NAO_ENCONTRADA,
        'Assinatura não encontrada para esta company',
        HttpStatus.NOT_FOUND,
      );
    }

    return subscription;
  }

  /** RF-22: vincula empresa a um plano. Uma empresa tem no máximo uma assinatura. */
  async create(dto: CreateSubscriptionDto, actorId?: string, ip?: string): Promise<Subscription> {
    await this.ensureCompanyExists(dto.companyId);
    await this.ensurePlanExists(dto.planId);

    const existing = await this.prisma.db.subscription.findUnique({
      where: { companyId: dto.companyId },
    });

    if (existing) {
      throw new BusinessException(
        BusinessErrorCode.ASSINATURA_JA_EXISTE,
        'Esta company já possui subscription. Use a troca de plan.',
        HttpStatus.CONFLICT,
      );
    }

    const subscription = (await this.prisma.db.subscription.create({
      data: {
        companyId: dto.companyId,
        planId: dto.planId,
        status: dto.status ?? SubscriptionStatus.TRIAL,
        renewsAt: new Date(dto.renewsAt),
      },
      include: { plan: true },
    })) as Subscription;

    this.accessGuard.invalidate(dto.companyId);

    await this.audit.log({
      action: 'subscription.created',
      resource: SUBSCRIPTIONS_RESOURCE,
      userId: actorId,
      companyId: dto.companyId,
      diff: { planId: dto.planId, status: subscription.status },
      ip,
    });

    return subscription;
  }

  /**
   * RN-12: só transições declaradas na máquina de estados são aceitas.
   * Recusar explicitamente é melhor que aceitar em silêncio — o estado da
   * assinatura decide se a empresa consegue trabalhar.
   */
  async changeStatus(
    companyId: string,
    newStatus: SubscriptionStatus,
    actorId?: string,
    ip?: string,
  ): Promise<Subscription> {
    const current = await this.findByCompany(companyId);

    if (current.status === newStatus) {
      return current;
    }

    if (!canTransition(current.status, newStatus)) {
      throw new BusinessException(
        BusinessErrorCode.TRANSICAO_INVALIDA,
        `Transição inválida: ${current.status} → ${newStatus}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const updated = (await this.prisma.db.subscription.update({
      where: { companyId },
      data: { status: newStatus },
      include: { plan: true },
    })) as Subscription;

    this.accessGuard.invalidate(companyId);

    await this.audit.log({
      action: 'subscription.status_changed',
      resource: SUBSCRIPTIONS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { from: current.status, to: newStatus },
      ip,
    });

    return updated;
  }

  /** RN-15: mudança de plano tem efeito imediato; cobrança proporcional é manual no MVP. */
  async changePlan(
    companyId: string,
    planId: string,
    actorId?: string,
    ip?: string,
  ): Promise<Subscription> {
    const current = await this.findByCompany(companyId);
    await this.ensurePlanExists(planId);

    const updated = (await this.prisma.db.subscription.update({
      where: { companyId },
      data: { planId },
      include: { plan: true },
    })) as Subscription;

    await this.audit.log({
      action: 'subscription.plan_changed',
      resource: SUBSCRIPTIONS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { from: current.planId, to: planId },
      ip,
    });

    return updated;
  }

  private async ensureCompanyExists(companyId: string): Promise<void> {
    const company = await this.prisma.db.company.findUnique({ where: { id: companyId } });

    if (!company) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Empresa não encontrada',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async ensurePlanExists(planId: string): Promise<void> {
    const plan = await this.prisma.db.plan.findUnique({ where: { id: planId } });

    if (!plan) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Plano não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
