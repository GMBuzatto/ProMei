import { IsString, MaxLength, MinLength } from 'class-validator';

/** `POST /payments/:id/reversal` (docs/22, docs/28, PD-15): motivo obrigatório. */
export class CreatePaymentReversalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason: string;
}
