import { describe, expect, it } from 'vitest';
import { SubscriptionStatus } from '../../src/generated/prisma/client';
import { canTransition } from '../../src/modules/subscriptions/subscription-state';

/** Máquina de estados da assinatura (RN-12). */
describe('transições da subscription', () => {
  it('trial pode virar ativa', () => {
    expect(canTransition(SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE)).toBe(true);
  });

  it('ativa pode virar inadimplente', () => {
    expect(canTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE)).toBe(true);
  });

  it('inadimplente pode voltar a ativa ao regularizar', () => {
    expect(canTransition(SubscriptionStatus.PAST_DUE, SubscriptionStatus.ACTIVE)).toBe(true);
  });

  it('inadimplente pode ser cancelada', () => {
    expect(canTransition(SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELED)).toBe(true);
  });

  it('cancelada é terminal — nenhuma transição sai dela', () => {
    for (const target of Object.values(SubscriptionStatus)) {
      expect(canTransition(SubscriptionStatus.CANCELED, target)).toBe(false);
    }
  });

  it('não dá para pular de trial direto para inadimplente', () => {
    expect(canTransition(SubscriptionStatus.TRIAL, SubscriptionStatus.PAST_DUE)).toBe(false);
  });

  it('não dá para voltar de ativa para trial', () => {
    expect(canTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL)).toBe(false);
  });
});
