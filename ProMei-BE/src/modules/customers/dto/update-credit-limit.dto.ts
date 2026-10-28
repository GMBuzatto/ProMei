import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * O teto (`FINANCE_MAX_CREDIT_LIMIT`, docs/16) não dá para expressar com um
 * `@Max` estático aqui — vem de env, então a checagem é no service. O que
 * cabe no DTO é a forma: número, duas casas (`Decimal(12,2)` no banco) e
 * nunca negativo (CHECK `credit_limit >= 0`).
 */
export class UpdateCreditLimitDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditLimit: number;

  /**
   * Justificativa opcional (docs/28), guardada em `audit_logs` junto do valor
   * anterior e do novo (RN-36). Opcional de propósito: exigir texto para
   * ajustar limite transformaria a trilha numa coleção de "." digitados às
   * pressas no balcão — o que a auditoria precisa provar é quem mudou, de
   * quanto para quanto e quando; o porquê é bem-vindo, não obrigatório.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
