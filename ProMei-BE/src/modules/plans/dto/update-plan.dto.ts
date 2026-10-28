import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PLAN_PERIODS, type PlanPeriod } from './create-plan.dto';
import { PlanLimitsDto } from './plan-limits.dto';

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsIn(PLAN_PERIODS)
  period?: PlanPeriod;

  @IsOptional()
  @ValidateNested()
  @Type(() => PlanLimitsDto)
  limits?: PlanLimitsDto;
}
