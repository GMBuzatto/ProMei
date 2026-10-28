import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { PlansModule } from './modules/plans/plans.module';
import { SharedModule } from './shared/shared.module';
import { AuditModule } from './modules/audit/audit.module';
import { PermissionsModule } from './modules/permissions';
import { RolesModule } from './modules/roles';
import { SubscriptionsModule } from './modules/subscriptions';
import { UsersModule } from './modules/users';
import { ItemsModule } from './modules/items';
import { InventoryModule } from './modules/inventory';
import { ReceiptsModule } from './modules/receipts';
import { ObservabilityModule } from './modules/observability';
import { FinanceModule } from './modules/finance';
import { CustomersModule } from './modules/customers';
import { SalesModule } from './modules/sales';
import { PaymentsModule } from './modules/payments';
import { TenantContextMiddleware } from './shared/tenant';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { PasswordChangeRequiredGuard } from './shared/guards/password-change-required.guard';
import { AccessModule, SubscriptionAccessGuard } from './shared/access';
import { PermissionsGuard } from './shared/guards/permissions.guard';

@Module({
  imports: [
    SharedModule,
    AccessModule,
    AuditModule,
    PermissionsModule,
    RolesModule,
    HealthModule,
    AuthModule,
    CompaniesModule,
    PlansModule,
    SubscriptionsModule,
    UsersModule,
    ItemsModule,
    InventoryModule,
    ReceiptsModule,
    ObservabilityModule,
    FinanceModule,
    CustomersModule,
    SalesModule,
    PaymentsModule,
  ],
  providers: [
    // Registrados aqui, e nao no SharedModule, porque o JwtAuthGuard depende do
    // JwtService (AuthModule) — shared nao deve depender de modulo de dominio.
    // A ordem e respeitada: autentica -> troca de senha pendente -> permissao
    // -> tabela de decisao de acesso.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PasswordChangeRequiredGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Tabela de decisao de acesso (docs/04): depois de autenticar e autorizar.
    { provide: APP_GUARD, useClass: SubscriptionAccessGuard },
  ],
})
export class AppModule implements NestModule {
  /**
   * O contexto de tenant precisa envolver TODA a cadeia da requisição — os
   * guards inclusive, porque é o JwtAuthGuard que o preenche. Middleware roda
   * antes dos guards; um interceptor rodaria depois e chegaria tarde.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*path');
  }
}
