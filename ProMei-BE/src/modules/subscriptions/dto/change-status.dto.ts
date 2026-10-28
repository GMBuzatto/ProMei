import { IsEnum } from 'class-validator';
import { SubscriptionStatus } from '../../../generated/prisma/client';

export class ChangeSubscriptionStatusDto {
  @IsEnum(SubscriptionStatus)
  status!: SubscriptionStatus;
}
