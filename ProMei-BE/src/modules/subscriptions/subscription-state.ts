import { SubscriptionStatus } from '../../generated/prisma/client';

/**
 * Máquina de estados da assinatura (RN-12).
 *
 * `trial` → `ativa` → `inadimplente` → (`ativa` ao regularizar | `cancelada` após 30 dias)
 *
 * `cancelada` é terminal: retomar exige nova assinatura, e não reviver a antiga
 * — o histórico de cobrança precisa continuar legível depois.
 */
export const ALLOWED_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  [SubscriptionStatus.TRIAL]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELED],
  [SubscriptionStatus.ACTIVE]: [SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELED],
  [SubscriptionStatus.PAST_DUE]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELED],
  [SubscriptionStatus.CANCELED]: [],
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
