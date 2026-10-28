import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Bloqueio MANUAL do operador (docs/18) — independente da situação financeira derivada. */
export class UpdateCreditBlockDto {
  @IsBoolean()
  blockedForCredit: boolean;

  /**
   * Justificativa opcional (docs/28): vai para `audit_logs` e para o
   * `context` do evento em `customer_status_events`, que é onde alguém vai
   * procurar "por que esse cliente está bloqueado" seis meses depois.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
