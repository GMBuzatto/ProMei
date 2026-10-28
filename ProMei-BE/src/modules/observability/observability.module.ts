import { Module } from '@nestjs/common';
import { FaultInjectionGuard } from './fault-injection.guard';
import { ObservabilityController } from './observability.controller';

/**
 * Ensaio dos alertas de observabilidade (docs/13, docs/15).
 *
 * O modulo e sempre registrado; quem decide se as rotas respondem e o
 * FaultInjectionGuard, a partir do ambiente. Registrar condicionalmente deixaria
 * o roteamento diferente entre ambientes — e ai o que se ensaia em staging nao
 * seria o mesmo app que roda em producao.
 */
@Module({
  controllers: [ObservabilityController],
  providers: [FaultInjectionGuard],
})
export class ObservabilityModule {}
