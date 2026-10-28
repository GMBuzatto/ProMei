import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import type { Company } from '../../generated/prisma/client';
import { CurrentUser, PlatformRoute, RequirePermission } from '../../shared/decorators';
import type { AuthenticatedUser } from '../../shared/logging';
import {
  CompaniesService,
  type PaginatedResult,
  type ProvisionedCompany,
} from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateCompanyStatusDto } from './dto/update-company-status.dto';
import { ListCompaniesQueryDto } from './dto/list-companies-query.dto';

/**
 * RN-10: empresa só é criada/gerenciada por Super Admin/Staff — recurso de
 * plataforma, cross-tenant (@PlatformRoute), sem escopo automático de empresa.
 */
@Controller('companies')
@PlatformRoute()
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @RequirePermission('companies:create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompanyDto,
    @Ip() ip: string,
  ): Promise<ProvisionedCompany> {
    return this.companiesService.create(dto, user.sub, ip);
  }

  @Get()
  @RequirePermission('companies:read')
  findAll(@Query() query: ListCompaniesQueryDto): Promise<PaginatedResult<Company>> {
    return this.companiesService.findAll(query.page, query.limit);
  }

  @Get(':id')
  @RequirePermission('companies:read')
  findOne(@Param('id') id: string): Promise<Company> {
    return this.companiesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('companies:update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @Ip() ip: string,
  ): Promise<Company> {
    return this.companiesService.update(id, dto, user.sub, ip);
  }

  @Patch(':id/status')
  @RequirePermission('companies:update')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyStatusDto,
    @Ip() ip: string,
  ): Promise<Company> {
    return this.companiesService.updateStatus(id, dto.status, user.sub, ip);
  }
}
