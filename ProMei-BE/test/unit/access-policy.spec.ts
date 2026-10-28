import { describe, expect, it } from 'vitest';
import { CompanyStatus, SubscriptionStatus } from '../../src/generated/prisma/client';
import { decideAccess, isWriteMethod } from '../../src/shared/access/access-policy';

/**
 * Cada linha da tabela de decisão do docs/04 vira um caso aqui.
 * É a regra que decide quem entra no produto — merece teste direto e legível.
 */
describe('tabela de decisão de acesso (docs/04)', () => {
  describe('company ativa', () => {
    it('subscription em trial: login, leitura e escrita', () => {
      expect(decideAccess(CompanyStatus.ACTIVE, SubscriptionStatus.TRIAL)).toMatchObject({
        canLogin: true,
        canRead: true,
        canWrite: true,
      });
    });

    it('subscription ativa: login, leitura e escrita', () => {
      expect(decideAccess(CompanyStatus.ACTIVE, SubscriptionStatus.ACTIVE)).toMatchObject({
        canLogin: true,
        canRead: true,
        canWrite: true,
      });
    });

    it('subscription inadimplente: login e leitura, SEM escrita (RN-13)', () => {
      const decision = decideAccess(CompanyStatus.ACTIVE, SubscriptionStatus.PAST_DUE);

      expect(decision.canLogin).toBe(true);
      expect(decision.canRead).toBe(true);
      expect(decision.canWrite).toBe(false);
      expect(decision.reason).toBe('SUBSCRIPTION_PAST_DUE');
    });

    it('subscription cancelada: modo leitura', () => {
      expect(decideAccess(CompanyStatus.ACTIVE, SubscriptionStatus.CANCELED).canWrite).toBe(false);
    });

    it('sem subscription: acesso normal — ausência de vínculo não é inadimplência', () => {
      const decision = decideAccess(CompanyStatus.ACTIVE, null);

      expect(decision.canLogin).toBe(true);
      expect(decision.canRead).toBe(true);
      expect(decision.canWrite).toBe(true);
    });
  });

  describe('company suspensa — bloqueio total (RN-13)', () => {
    const possibleStatuses = [
      SubscriptionStatus.TRIAL,
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.PAST_DUE,
      SubscriptionStatus.CANCELED,
      null,
    ];

    it.each(possibleStatuses)('nega tudo com subscription %s', (subscription) => {
      const decision = decideAccess(CompanyStatus.SUSPENDED, subscription);

      expect(decision).toMatchObject({ canLogin: false, canRead: false, canWrite: false });
      expect(decision.reason).toBe('COMPANY_SUSPENDED');
    });
  });

  describe('company cancelada — bloqueio total (RN-11)', () => {
    it('nega login, leitura e escrita mesmo com subscription ativa', () => {
      const decision = decideAccess(CompanyStatus.CANCELED, SubscriptionStatus.ACTIVE);

      expect(decision).toMatchObject({ canLogin: false, canRead: false, canWrite: false });
      expect(decision.reason).toBe('COMPANY_CANCELED');
    });
  });

  describe('o estado da company tem precedência sobre o da subscription', () => {
    it('company suspensa com subscription ativa continua bloqueada', () => {
      expect(decideAccess(CompanyStatus.SUSPENDED, SubscriptionStatus.ACTIVE).canLogin).toBe(false);
    });
  });

  describe('isWriteMethod', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post', 'patch'])('%s é escrita', (method) => {
      expect(isWriteMethod(method)).toBe(true);
    });

    it.each(['GET', 'HEAD', 'OPTIONS', 'get'])('%s é leitura', (method) => {
      expect(isWriteMethod(method)).toBe(false);
    });
  });
});
