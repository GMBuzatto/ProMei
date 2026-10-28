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
import type { Customer, CustomerStatusEvent } from '../../generated/prisma/client';
import { CurrentUser, RequirePermission } from '../../shared/decorators';
import type { AuthenticatedUser } from '../../shared/logging';
import {
  CustomersService,
  type CustomerListItem,
  type CustomerRemovalResult,
  type FinancialSummary,
  type PaginatedResult,
} from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { GetFinancialSummaryQueryDto } from './dto/get-financial-summary-query.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { ListStatusEventsQueryDto } from './dto/list-status-events-query.dto';
import { UpdateCreditBlockDto } from './dto/update-credit-block.dto';
import { UpdateCreditLimitDto } from './dto/update-credit-limit.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';

/**
 * CRUD de clientes (docs/18, RN-30 a RN-38). Rota de tenant: o escopo de
 * empresa vem do JWT, e usuário de plataforma não acessa — cliente pertence
 * a uma empresa (RN-30).
 */
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @RequirePermission('customers:create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
    @Ip() ip: string,
  ): Promise<Customer> {
    return this.customersService.create(user.company_id as string, dto, user.sub, ip);
  }

  @Get()
  @RequirePermission('customers:read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCustomersQueryDto,
  ): Promise<PaginatedResult<CustomerListItem>> {
    return this.customersService.findAll(user.company_id as string, query);
  }

  @Get(':id')
  @RequirePermission('customers:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Customer> {
    return this.customersService.findOne(id, user.company_id as string);
  }

  /**
   * `period` × `lifetime` (docs/18, docs/28): régua mensal vs. escala
   * vitalícia, separadas de propósito — misturar as duas sem rótulo é a
   * origem clássica de "o sistema disse que eu podia comprar".
   */
  @Get(':id/financial-summary')
  @RequirePermission('customers:read')
  getFinancialSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: GetFinancialSummaryQueryDto,
  ): Promise<FinancialSummary> {
    return this.customersService.getFinancialSummary(id, user.company_id as string, query.period);
  }

  /** Histórico append-only de situação financeira (docs/18, RN-66), paginado. */
  @Get(':id/status-events')
  @RequirePermission('customers:read')
  getStatusEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: ListStatusEventsQueryDto,
  ): Promise<PaginatedResult<CustomerStatusEvent>> {
    return this.customersService.getStatusEvents(id, user.company_id as string, query);
  }

  @Patch(':id')
  @RequirePermission('customers:update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @Ip() ip: string,
  ): Promise<Customer> {
    return this.customersService.update(id, user.company_id as string, dto, user.sub, ip);
  }

  /** Inativação e reativação explícitas (RN-33: ativo ⇄ inativo). */
  @Patch(':id/status')
  @RequirePermission('customers:update')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerStatusDto,
    @Ip() ip: string,
  ): Promise<Customer> {
    return this.customersService.updateStatus(
      id,
      user.company_id as string,
      dto.status,
      user.sub,
      ip,
    );
  }

  /**
   * PD-16: recurso `customer-credit`, permissão própria — separada de
   * `customers:update` porque "corrigir o telefone" e "dar R$ 5.000 de
   * crédito" não podem ser a mesma permissão.
   */
  @Patch(':id/credit-limit')
  @RequirePermission('customer-credit:update')
  updateCreditLimit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCreditLimitDto,
    @Ip() ip: string,
  ): Promise<Customer> {
    return this.customersService.updateCreditLimit(
      id,
      user.company_id as string,
      dto.creditLimit,
      user.sub,
      ip,
      dto.reason,
    );
  }

  /** PD-16: mesmo recurso/permissão de `credit-limit`, mesmo motivo de separação. */
  @Patch(':id/credit-block')
  @RequirePermission('customer-credit:update')
  updateCreditBlock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCreditBlockDto,
    @Ip() ip: string,
  ): Promise<Customer> {
    return this.customersService.updateCreditBlock(
      id,
      user.company_id as string,
      dto.blockedForCredit,
      user.sub,
      ip,
      dto.reason,
    );
  }

  /**
   * RN-32: cliente com venda vinculada é inativado, não excluído. Responde
   * 200 com o desfecho (`DELETED` | `INACTIVATED`) em vez de 204 — sem
   * corpo, o cliente não teria como saber qual dos dois aconteceu. Mesmo
   * contrato de `DELETE /items/:id`.
   */
  @Delete(':id')
  @RequirePermission('customers:delete')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<CustomerRemovalResult> {
    return this.customersService.remove(id, user.company_id as string, user.sub, ip);
  }

  /**
   * LGPD, PD-17, RN-38: exclusão a pedido do TITULAR é anonimização, não
   * exclusão física — mesma permissão de `DELETE /:id` porque a gravidade é
   * a mesma (dado irreversivelmente alterado), mas a ação é distinta o
   * bastante (nunca hard-delete, mesmo sem venda) para merecer rota própria.
   *
   * ⚠️ PD-17: redação final e base legal pendentes de validação jurídica
   * antes do go-live — não bloqueia este código.
   */
  @Post(':id/anonymize')
  @HttpCode(200)
  @RequirePermission('customers:delete')
  anonymize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<Customer> {
    return this.customersService.anonymize(id, user.company_id as string, user.sub, ip);
  }
}
