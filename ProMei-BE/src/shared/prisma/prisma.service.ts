import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { Env } from '../config';
import { getTenantContext, getTenantTransaction } from '../tenant/tenant-context';
import { tenantExtension } from '../tenant/tenant.extension';

/**
 * A partir do Prisma 7 o client exige um driver adapter: a connection string
 * não vem mais do schema, e sim daqui.
 *
 * `connectionTimeoutMillis` é explícito de propósito — o driver `pg` não tem
 * timeout por padrão (`0`), enquanto o Prisma 6 usava 5s. Sem isso, uma falha de
 * rede deixaria a query pendurada indefinidamente.
 *
 * `max` (docs/16, `DATABASE_POOL_MAX`) também é explícito: o default do
 * `pg` (10) é apertado para requisições que seguram conexão por uma
 * transação inteira (venda com N itens, lock de cliente) — sob
 * concorrência real, o pool esgota e devolve "timeout exceeded when trying
 * to connect" antes de qualquer lock do Postgres entrar em jogo.
 */
function createAdapter(databaseUrl: string, poolMax: number): PrismaPg {
  return new PrismaPg({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    max: poolMax,
  });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Client com escopo de tenant aplicado (ADR-0003 / docs-06).
   *
   * `$extends` devolve um NOVO client em vez de alterar este — por isso o
   * resultado fica guardado aqui e é ele que o `PrismaModule` entrega aos
   * services. Usar `this` diretamente pula o escopo de tenant.
   */
  readonly scoped: PrismaClient;

  constructor(configService: ConfigService<Env, true>) {
    super({
      adapter: createAdapter(
        configService.getOrThrow<string>('DATABASE_URL'),
        configService.get('DATABASE_POOL_MAX', { infer: true }),
      ),
    });
    this.scoped = this.$extends(tenantExtension()) as unknown as PrismaClient;
  }

  /**
   * A conexão é tentada no boot, mas uma falha NÃO derruba a aplicação:
   * o processo sobe e o `/health/ready` passa a responder 503 até o banco
   * voltar. Derrubar o processo tornaria o readiness inútil, porque não
   * haveria ninguém para responder.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Conexão com o banco estabelecida');
    } catch (error) {
      this.logger.error(
        { err: error },
        'Falha ao conectar no banco durante o boot. A API sobe degradada e /health/ready respondera 503.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Client que os services devem usar — sempre, em vez do client cru.
   *
   * Hoje devolve o client com a Client Extension de tenant (primeira barreira).
   * Se houver uma transação de tenant aberta por `withTenantSession`, devolve
   * ela, para que o RLS também enxergue o tenant.
   *
   * O ponto de indireção existe para que trocar a estratégia de escopo no futuro
   * não exija tocar em service nenhum.
   */
  get db(): Prisma.TransactionClient {
    return (getTenantTransaction() as Prisma.TransactionClient | undefined) ?? this.scoped;
  }

  /**
   * Executa o callback com o contexto de tenant publicado na **sessão do banco**,
   * ativando as policies de Row-Level Security (ADR-0003).
   *
   * Precisa ser dentro de `$transaction`: o driver `pg` usa pool, então sem a
   * transação a query seguinte poderia sair por outra conexão, onde o
   * `set_config` não vale. `is_local = true` faz a configuração morrer junto com
   * a transação, sem vazar para a próxima requisição que reusar a conexão.
   *
   * NÃO é usado por requisição. Tentamos isso e o custo apareceu rápido: com a
   * requisição inteira em transação, uma exceção faz rollback do que precisa
   * sobreviver a ela — contagem de tentativas de login (RF-03) e trilha de
   * auditoria são gravadas justamente quando a requisição falha.
   *
   * Use pontualmente, em operações que precisem do RLS ativo e não dependam de
   * persistir efeitos após erro.
   *
   * `options` repassa os limites da transação interativa do Prisma. Quem segura
   * lock de linha (ex.: movimentação de estoque, RN-21) precisa de um teto
   * maior que o padrão de 5s, senão a transação morre antes do lock.
   */
  async withTenantSession<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    const context = getTenantContext();
    const companyId = context?.companyId;
    const isPlatform = context?.isPlatformUser ?? false;

    return this.scoped.$transaction(async (tx) => {
      if (isPlatform || !companyId) {
        await tx.$executeRaw`SELECT set_config('app.platform_access', 'on', true)`;
      } else {
        await tx.$executeRaw`SELECT set_config('app.current_company_id', ${companyId}, true)`;
      }

      return callback(tx);
    }, options);
  }
}
