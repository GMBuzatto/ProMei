import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class InjectLatencyDto {
  /**
   * Atraso pedido, em ms. O teto real vem de `FAULT_INJECTION_MAX_DELAY_MS` e e
   * aplicado no service — aqui so se garante que e inteiro nao negativo.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'delayMs deve ser um inteiro em milissegundos' })
  @Min(0, { message: 'delayMs nao pode ser negativo' })
  delayMs?: number;
}
