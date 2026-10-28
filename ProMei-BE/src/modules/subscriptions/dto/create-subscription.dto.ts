import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { SubscriptionStatus } from '../../../generated/prisma/client';

export class CreateSubscriptionDto {
  @IsUUID()
  companyId!: string;

  @IsUUID()
  planId!: string;

  /** Sem status informado, a assinatura nasce em trial (RN-12). */
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsDateString()
  renewsAt!: string;
}
