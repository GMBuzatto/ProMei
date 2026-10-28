import { Body, Controller, Get, Ip, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../../shared/decorators';
import type { AuthenticatedUser } from '../../shared/logging';
import {
  SalesService,
  type CreateSaleResponse,
  type PaginatedResult,
  type SaleDetailResponse,
  type SaleListItem,
} from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';

/**
 * Vendas (docs/19, docs/28, ADR-0006). Rota de tenant, hoje só venda à
 * vista — `POST` cria e confirma na mesma requisição, não existe rascunho.
 */
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @RequirePermission('sales:create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSaleDto,
    @Ip() ip: string,
  ): Promise<CreateSaleResponse> {
    return this.salesService.create(user.company_id as string, user.sub as string, dto, ip);
  }

  @Get()
  @RequirePermission('sales:read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSalesQueryDto,
  ): Promise<PaginatedResult<SaleListItem>> {
    return this.salesService.findAll(user.company_id as string, query);
  }

  @Get(':id')
  @RequirePermission('sales:read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<SaleDetailResponse> {
    return this.salesService.findOne(id, user.company_id as string);
  }
}
