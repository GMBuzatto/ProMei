import { Body, Controller, Get, Ip, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, PlatformRoute, RequirePermission } from '../../shared/decorators';
import type { AuthenticatedUser } from '../../shared/logging';
import type { Subscription } from '../../generated/prisma/client';
import { ChangePlanDto } from './dto/change-plan.dto';
import { ChangeSubscriptionStatusDto } from './dto/change-status.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Gestão de assinaturas (RF-22/23) — rota de plataforma: quem administra
 * cobrança é Super Admin/Staff, não a própria empresa (RN-10).
 */
@Controller('subscriptions')
@PlatformRoute()
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  @RequirePermission('subscriptions:create')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSubscriptionDto,
    @Ip() ip: string,
  ): Promise<Subscription> {
    return this.subscriptionsService.create(dto, user.sub, ip);
  }

  @Get(':companyId')
  @RequirePermission('subscriptions:read')
  async findByCompany(@Param('companyId') companyId: string): Promise<Subscription> {
    return this.subscriptionsService.findByCompany(companyId);
  }

  @Patch(':companyId/status')
  @RequirePermission('subscriptions:update')
  async changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Body() dto: ChangeSubscriptionStatusDto,
    @Ip() ip: string,
  ): Promise<Subscription> {
    return this.subscriptionsService.changeStatus(companyId, dto.status, user.sub, ip);
  }

  @Patch(':companyId/plan')
  @RequirePermission('subscriptions:update')
  async changePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('companyId') companyId: string,
    @Body() dto: ChangePlanDto,
    @Ip() ip: string,
  ): Promise<Subscription> {
    return this.subscriptionsService.changePlan(companyId, dto.planId, user.sub, ip);
  }
}
