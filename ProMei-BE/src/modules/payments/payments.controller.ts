import { Body, Controller, Ip, Param, Post } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../../shared/decorators';
import type { AuthenticatedUser } from '../../shared/logging';
import {
  PaymentsService,
  type PaymentResponse,
  type PaymentReversalResponse,
} from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreatePaymentReversalDto } from './dto/create-payment-reversal.dto';

/**
 * Recebimentos (docs/22, docs/28, ADR-0006-like: nunca editado nem
 * excluído — correção é estorno). Rota de tenant.
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @RequirePermission('payments:create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentDto,
    @Ip() ip: string,
  ): Promise<PaymentResponse> {
    return this.paymentsService.create(user.company_id as string, user.sub as string, dto, ip);
  }

  // PD-15: sub-recurso, e não `DELETE /payments/:id`, porque o motivo é
  // obrigatório — corpo em DELETE pode ser descartado por proxy, e query
  // string vazaria para log de acesso. Permissão continua `payments:delete`,
  // que representa "desfazer um recebimento" no catálogo (RN-74).
  @Post(':id/reversal')
  @RequirePermission('payments:delete')
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreatePaymentReversalDto,
    @Ip() ip: string,
  ): Promise<PaymentReversalResponse> {
    return this.paymentsService.reverse(user.company_id as string, user.sub as string, id, dto, ip);
  }
}
