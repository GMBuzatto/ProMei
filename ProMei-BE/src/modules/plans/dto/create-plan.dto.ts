import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { PlanLimitsDto } from './plan-limits.dto';

export const PLAN_PERIODS = ['monthly', 'yearly'] as const;
export type PlanPeriod = (typeof PLAN_PERIODS)[number];

export class CreatePlanDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @IsIn(PLAN_PERIODS)
  period: PlanPeriod;

  @ValidateNested()
  @Type(() => PlanLimitsDto)
  limits: PlanLimitsDto;
}
