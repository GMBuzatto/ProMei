import { IsEnum } from 'class-validator';
import { CustomerStatus } from '../../../generated/prisma/client';

/** Máquina de estados do cliente (RN-33): ativo ⇄ inativo, nunca exclusão. */
export class UpdateCustomerStatusDto {
  @IsEnum(CustomerStatus)
  status: CustomerStatus;
}
