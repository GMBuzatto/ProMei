/**
 * Política de bloqueio progressivo (RF-03 e docs/09-seguranca.md).
 *
 * A cada bloqueio consecutivo a duração dobra, partindo da duração base e
 * limitada por um teto. Reincidir fica caro para quem ataca, enquanto o usuário
 * legítimo que errou a senha uma vez espera apenas a duração base.
 *
 * Com base de 15 min e teto de 1 h: 15min → 30min → 60min → 60min...
 *
 * O contador zera em todo login bem-sucedido.
 */
export interface LockoutPolicyOptions {
  baseDurationMs: number;
  maxDurationMs: number;
}

export function calculateLockoutDurationMs(
  lockoutCount: number,
  { baseDurationMs, maxDurationMs }: LockoutPolicyOptions,
): number {
  // lockoutCount é quantos bloqueios o usuário JÁ teve; o atual é o próximo.
  const occurrence = Math.max(0, lockoutCount);
  const multiplier = 2 ** occurrence;

  // Evita overflow para Infinity quando o contador cresce muito.
  if (!Number.isFinite(multiplier)) {
    return maxDurationMs;
  }

  return Math.min(baseDurationMs * multiplier, maxDurationMs);
}

export function calculateLockedUntil(
  lockoutCount: number,
  options: LockoutPolicyOptions,
  now: Date = new Date(),
): Date {
  return new Date(now.getTime() + calculateLockoutDurationMs(lockoutCount, options));
}
