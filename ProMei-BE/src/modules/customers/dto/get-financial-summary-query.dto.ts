import { IsOptional, Matches } from 'class-validator';

/** `period` no formato `YYYY-MM` (docs/18); ausente = período corrente. */
export class GetFinancialSummaryQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period must be in YYYY-MM format' })
  period?: string;
}
