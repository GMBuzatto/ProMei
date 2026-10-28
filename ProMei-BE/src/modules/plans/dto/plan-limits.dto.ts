import { IsInt, Min } from 'class-validator';

/** RN-14: limites do plano (usuários, itens) validados na criação/edição. */
export class PlanLimitsDto {
  @IsInt()
  @Min(1)
  maxUsers: number;

  @IsInt()
  @Min(1)
  maxItems: number;
}
