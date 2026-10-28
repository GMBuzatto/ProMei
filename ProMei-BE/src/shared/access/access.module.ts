import { Global, Module } from '@nestjs/common';
import { SubscriptionAccessGuard } from './subscription-access.guard';

/**
 * Global porque o guard é registrado como APP_GUARD **e** injetado por services
 * que precisam invalidar o cache de decisão (mudança de estado de assinatura ou
 * empresa). Sem isso, cada módulo teria que reprovisionar o guard — e passaria a
 * existir mais de uma instância, cada uma com seu próprio cache.
 */
@Global()
@Module({
  providers: [SubscriptionAccessGuard],
  exports: [SubscriptionAccessGuard],
})
export class AccessModule {}
