import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { HealthService } from '../../src/modules/health/health.service';
import { PrismaService } from '../../src/shared/prisma';

// O servico lista prisma/migrations no disco para detectar migrações pendentes.
// Sem mock, o resultado dependeria do estado da maquina que roda o teste.
vi.mock('node:fs', () => ({ readdirSync: vi.fn(() => []) }));

const readdirMock = vi.mocked(readdirSync);

function migrationsOnDisk(...names: string[]): void {
  readdirMock.mockReturnValue(
    names.map((name) => ({ name, isDirectory: () => true })) as unknown as ReturnType<
      typeof readdirSync
    >,
  );
}

type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

/**
 * $queryRaw e chamado duas vezes: SELECT 1 (banco) e depois a consulta em
 * _prisma_migrations. O mock responde conforme a ordem das chamadas.
 */
function createPrisma(options: { databaseOk?: boolean; migrations?: MigrationRow[] | Error }) {
  const { databaseOk = true, migrations = [] } = options;
  let callCount = 0;

  const queryRaw = vi.fn(() => {
    callCount += 1;
    if (callCount === 1) {
      return databaseOk
        ? Promise.resolve([{ '?column?': 1 }])
        : Promise.reject(new Error('ECONNREFUSED'));
    }
    return migrations instanceof Error ? Promise.reject(migrations) : Promise.resolve(migrations);
  });

  return { $queryRaw: queryRaw } as unknown as PrismaService;
}

function applied(name: string): MigrationRow {
  return { migration_name: name, finished_at: new Date(), rolled_back_at: null };
}

async function createService(prisma: PrismaService): Promise<HealthService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      HealthService,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => (key === 'HEALTH_CHECK_TIMEOUT_MS' ? 3000 : 'test'),
        },
      },
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();

  return moduleRef.get(HealthService);
}

describe('HealthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    migrationsOnDisk();
  });

  describe('liveness', () => {
    it('retorna ok sem tocar no banco', async () => {
      const service = await createService(createPrisma({}));
      const result = service.check();

      expect(result.status).toBe('ok');
      expect(result.environment).toBe('test');
      expect(result.service).toBe('promei-api');
    });
  });

  describe('readiness', () => {
    it('retorna ok com banco acessivel e migracao applied', async () => {
      migrationsOnDisk('20260804193927_init');
      const service = await createService(
        createPrisma({ migrations: [applied('20260804193927_init')] }),
      );

      const result = await service.checkReadiness();

      expect(result.status).toBe('ok');
      expect(result.checks.database.status).toBe('ok');
      expect(result.checks.migrations.status).toBe('ok');
      expect(result.checks.migrations.applied).toBe(1);
      expect(result.checks.migrations.pending).toEqual([]);
    });

    it('retorna error quando o banco esta inacessivel', async () => {
      const service = await createService(createPrisma({ databaseOk: false }));

      const result = await service.checkReadiness();

      expect(result.status).toBe('error');
      expect(result.checks.database.status).toBe('error');
      expect(result.checks.database.detail).toContain('ECONNREFUSED');
      expect(result.checks.migrations.detail).toBe('banco inacessivel');
    });

    it('acusa migracao pendente quando existe no disco mas nao no banco', async () => {
      migrationsOnDisk('20260804193927_init', '20260805_nova');
      const service = await createService(
        createPrisma({ migrations: [applied('20260804193927_init')] }),
      );

      const result = await service.checkReadiness();

      expect(result.status).toBe('error');
      expect(result.checks.migrations.pending).toEqual(['20260805_nova']);
      expect(result.checks.migrations.detail).toBe('ha migrations pending de aplicacao');
    });

    it('retorna error quando nenhuma migracao foi applied', async () => {
      const service = await createService(createPrisma({ migrations: [] }));

      const result = await service.checkReadiness();

      expect(result.status).toBe('error');
      expect(result.checks.migrations.detail).toBe('nenhuma migracao applied');
    });

    it('retorna error quando a tabela _prisma_migrations nao existe', async () => {
      const service = await createService(
        createPrisma({ migrations: new Error('relation "_prisma_migrations" does not exist') }),
      );

      const result = await service.checkReadiness();

      expect(result.status).toBe('error');
      expect(result.checks.migrations.detail).toContain('_prisma_migrations');
    });

    it('retorna error quando ha migracao revertida', async () => {
      migrationsOnDisk('20260804193927_init', '20260805_falha');
      const service = await createService(
        createPrisma({
          migrations: [
            applied('20260804193927_init'),
            { migration_name: '20260805_falha', finished_at: null, rolled_back_at: new Date() },
          ],
        }),
      );

      const result = await service.checkReadiness();

      expect(result.status).toBe('error');
      expect(result.checks.migrations.failed).toContain('20260805_falha');
    });
  });
});
