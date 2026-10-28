import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import type { Item } from '../../generated/prisma/client';
import { CurrentUser, RequirePermission } from '../../shared/decorators';
import type { AuthenticatedUser } from '../../shared/logging';
import {
  ItemsService,
  type ItemRemovalResult,
  type ItemWithAlert,
  type PaginatedResult,
} from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { UpdateItemStatusDto } from './dto/update-item-status.dto';
import { ListItemsQueryDto } from './dto/list-items-query.dto';

/**
 * CRUD de itens (RF-30/31). Rota de tenant: o escopo de empresa vem do JWT, e
 * usuário de plataforma não acessa — item pertence a uma empresa (RN-02).
 */
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @RequirePermission('items:create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateItemDto,
    @Ip() ip: string,
  ): Promise<Item> {
    return this.itemsService.create(user.company_id as string, dto, user.sub, ip);
  }

  @Get()
  @RequirePermission('items:read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListItemsQueryDto,
  ): Promise<PaginatedResult<ItemWithAlert>> {
    return this.itemsService.findAll(user.company_id as string, query);
  }

  @Get(':id')
  @RequirePermission('items:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<ItemWithAlert> {
    return this.itemsService.findOne(id, user.company_id as string);
  }

  @Patch(':id')
  @RequirePermission('items:update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
    @Ip() ip: string,
  ): Promise<Item> {
    return this.itemsService.update(id, user.company_id as string, dto, user.sub, ip);
  }

  /** Inativação e reativação explícitas (docs/04: ativo ⇄ inativo). */
  @Patch(':id/status')
  @RequirePermission('items:update')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateItemStatusDto,
    @Ip() ip: string,
  ): Promise<Item> {
    return this.itemsService.updateStatus(id, user.company_id as string, dto.status, user.sub, ip);
  }

  /**
   * RN-23: item com movimentação é inativado, não excluído. Responde 200 com o
   * desfecho (`DELETED` | `INACTIVATED`) em vez de 204 — sem corpo, o cliente
   * não teria como saber qual dos dois aconteceu.
   */
  @Delete(':id')
  @RequirePermission('items:delete')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<ItemRemovalResult> {
    return this.itemsService.remove(id, user.company_id as string, user.sub, ip);
  }
}
