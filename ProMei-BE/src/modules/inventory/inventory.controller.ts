import { Body, Controller, Get, Ip, Post, Query } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../../shared/decorators';
import type { AuthenticatedUser } from '../../shared/logging';
import {
  InventoryService,
  type PaginatedResult,
  type StockMovementHistoryEntry,
  type StockMovementResult,
} from './inventory.service';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { ListStockMovementsQueryDto } from './dto/list-stock-movements-query.dto';

/**
 * Movimentações de estoque (RF-32): `POST /api/v1/stock-movements`.
 *
 * A rota é o nome da tabela, não o nome do módulo. `docs/08` usa
 * `/stock-movements` como exemplo literal, e a permissão exigida é
 * `stock-movements:create` — rota e permissão precisam falar a mesma coisa,
 * senão quem procura uma pela outra não encontra.
 *
 * Rota de tenant: a empresa vem do JWT, nunca do corpo. Não existe PUT/PATCH nem
 * DELETE aqui de propósito — movimentação é imutável, e correção é um ajuste
 * (RN-22). A ausência dos verbos é a regra sendo aplicada.
 */
@Controller('stock-movements')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @RequirePermission('stock-movements:create')
  createMovement(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStockMovementDto,
    @Ip() ip: string,
  ): Promise<StockMovementResult> {
    // `sub` e `company_id` são garantidos pelo JwtAuthGuard em rota de tenant —
    // RF-32 exige "quem", então o autor não é opcional aqui como no audit log.
    return this.inventoryService.createMovement(
      user.company_id as string,
      user.sub as string,
      dto,
      ip,
    );
  }

  /**
   * RF-34: histórico de movimentações, filtrável por item e por período.
   *
   * `GET /api/v1/stock-movements` — o histórico é a listagem do próprio
   * recurso, não um sub-recurso dele. Chegou como `@Get('movements')` de um
   * merge em que o controller ainda era `@Controller('inventory')`; mantido
   * assim resultaria em `/stock-movements/movements`.
   */
  @Get()
  @RequirePermission('stock-movements:read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListStockMovementsQueryDto,
  ): Promise<PaginatedResult<StockMovementHistoryEntry>> {
    return this.inventoryService.findAll(user.company_id as string, query);
  }
}
