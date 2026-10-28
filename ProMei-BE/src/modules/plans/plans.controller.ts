import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Plan } from '../../generated/prisma/client';
import { CurrentUser, PlatformRoute, RequirePermission } from '../../shared/decorators';
import type { AuthenticatedUser } from '../../shared/logging';
import { PlansService, type PaginatedResult } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ListPlansQueryDto } from './dto/list-plans-query.dto';

/**
 * RF-21: planos são geridos por Super Admin/Staff, mesma governança de RN-10
 * — recurso de plataforma, cross-tenant (@PlatformRoute).
 */
@Controller('plans')
@PlatformRoute()
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  @RequirePermission('plans:create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePlanDto,
    @Ip() ip: string,
  ): Promise<Plan> {
    return this.plansService.create(dto, user.sub, ip);
  }

  @Get()
  @RequirePermission('plans:read')
  findAll(@Query() query: ListPlansQueryDto): Promise<PaginatedResult<Plan>> {
    return this.plansService.findAll(query.page, query.limit);
  }

  @Get(':id')
  @RequirePermission('plans:read')
  findOne(@Param('id') id: string): Promise<Plan> {
    return this.plansService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('plans:update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @Ip() ip: string,
  ): Promise<Plan> {
    return this.plansService.update(id, dto, user.sub, ip);
  }

  @Delete(':id')
  @RequirePermission('plans:delete')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<void> {
    return this.plansService.remove(id, user.sub, ip);
  }
}
