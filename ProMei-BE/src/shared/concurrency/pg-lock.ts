import { HttpStatus } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { BusinessErrorCode, BusinessException } from '../errors';

/**
 * Lock e contenção do Postgres (docs/19#concorrência, docs/23#concorrência).
 *
 * Extraído de `InventoryService`: estoque e venda travam linhas com
 * `SELECT ... FOR UPDATE` e precisam do mesmo par lock_timeout / tradução
 * de erro para 409. Duplicar entre os dois módulos criaria dois lugares
 * para consertar o mesmo bug — só um dos dois seria corrigido no dia em
 * que alguém encontrasse o problema.
 */

/** `lock_not_available`: o `lock_timeout` estourou esperando a linha travada. */
export const PG_LOCK_NOT_AVAILABLE = '55P03';

/** Transação interativa do Prisma encerrada por timeout. */
export const PRISMA_TRANSACTION_TIMEOUT_CODE = 'P2028';

/**
 * Teto de espera pelo lock, local à transação corrente.
 *
 * `is_local = true` faz a configuração morrer no fim da transação, sem
 * vazar para a próxima requisição que reusar a conexão do pool. Sem teto,
 * uma transação pendurada seguraria a fila inteira esperando o lock até o
 * timeout do Prisma — e aí o erro chegaria sem dizer que foi contenção.
 */
export async function applyLockTimeout(
  tx: Prisma.TransactionClient,
  timeoutMs: number,
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('lock_timeout', ${`${String(timeoutMs)}ms`}, true)`;
}

/**
 * Contenção vira 409, não 500.
 *
 * Estourar o `lock_timeout` (ou o teto da transação) não é bug nem culpa do
 * cliente: é fila. O 409 diz exatamente isso — a requisição pode ser
 * repetida como está. Qualquer outro erro passa intacto para o filter
 * global.
 */
export function translateConcurrencyError(error: unknown, message: string): unknown {
  if (error instanceof BusinessException) return error;

  if (isLockTimeoutError(error)) {
    return new BusinessException(
      BusinessErrorCode.CONFLITO_DE_CONCORRENCIA,
      message,
      HttpStatus.CONFLICT,
    );
  }

  return error;
}

/**
 * O 55P03 do Postgres chega embrulhado pelo driver adapter — ora em
 * `meta.code`, ora só no texto. Procurar o código nos dois evita depender
 * do formato exato, que muda entre versões do adapter.
 */
export function isLockTimeoutError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === PRISMA_TRANSACTION_TIMEOUT_CODE
  ) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = error.meta as { code?: unknown } | undefined;
    if (meta?.code === PG_LOCK_NOT_AVAILABLE) return true;
  }

  return error instanceof Error && error.message.includes(PG_LOCK_NOT_AVAILABLE);
}
