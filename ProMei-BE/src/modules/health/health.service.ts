import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/prisma';
import type { Env } from '../../shared/config';

export interface LivenessStatus {
  status: 'ok';
  service: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface CheckResult {
  status: 'ok' | 'error';
  detail?: string;
}

export interface DatabaseCheck extends CheckResult {
  latencyMs?: number;
}

export interface MigrationsCheck extends CheckResult {
  applied?: number;
  pending?: string[];
  failed?: string[];
}

export interface ReadinessStatus {
  status: 'ok' | 'error';
  service: string;
  timestamp: string;
  checks: {
    database: DatabaseCheck;
    migrations: MigrationsCheck;
  };
}

interface MigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Evita que um banco pendurado deixe o readiness sem response. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout apos ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly checkTimeoutMs: number;

  constructor(
    private readonly configService: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    this.checkTimeoutMs = this.configService.get('HEALTH_CHECK_TIMEOUT_MS', { infer: true });
  }

  /** Liveness: o processo esta vivo. Nao toca em dependencia externa. */
  check(): LivenessStatus {
    return {
      status: 'ok',
      service: 'promei-api',
      environment: this.configService.get('NODE_ENV', { infer: true }),
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness: banco acessivel e migrações aplicadas (docs/13-observabilidade.md). */
  async checkReadiness(): Promise<ReadinessStatus> {
    const database = await this.checkDatabase();
    const migrations =
      database.status === 'ok'
        ? await this.checkMigrations()
        : { status: 'error' as const, detail: 'banco inacessivel' };

    const status = database.status === 'ok' && migrations.status === 'ok' ? 'ok' : 'error';

    if (status === 'error') {
      this.logger.warn({ database, migrations }, 'Readiness degradado');
    }

    return {
      status,
      service: 'promei-api',
      timestamp: new Date().toISOString(),
      checks: { database, migrations },
    };
  }

  private async checkDatabase(): Promise<DatabaseCheck> {
    const startedAt = Date.now();
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, this.checkTimeoutMs);
      return { status: 'ok', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return { status: 'error', detail: errorMessage(error) };
    }
  }

  private async checkMigrations(): Promise<MigrationsCheck> {
    try {
      const rows = await withTimeout(
        this.prisma.$queryRaw<MigrationRow[]>`
          SELECT migration_name, finished_at, rolled_back_at
          FROM _prisma_migrations
        `,
        this.checkTimeoutMs,
      );

      const appliedRows = rows.filter(
        (line) => line.finished_at !== null && line.rolled_back_at === null,
      );
      const failed = rows
        .filter((line) => line.rolled_back_at !== null || line.finished_at === null)
        .map((line) => line.migration_name);

      const appliedNames = new Set(appliedRows.map((line) => line.migration_name));
      const pending = this.migrationsOnDisk().filter((name) => !appliedNames.has(name));

      if (failed.length > 0) {
        return {
          status: 'error',
          applied: appliedRows.length,
          failed: failed,
          pending: pending,
          detail: 'ha migrations com falha ou revertidas',
        };
      }

      if (pending.length > 0) {
        return {
          status: 'error',
          applied: appliedRows.length,
          pending: pending,
          detail: 'ha migrations pending de aplicacao',
        };
      }

      if (appliedRows.length === 0) {
        return {
          status: 'error',
          applied: 0,
          pending: pending,
          detail: 'nenhuma migracao applied',
        };
      }

      return { status: 'ok', applied: appliedRows.length, pending: [], failed: [] };
    } catch (error) {
      // Tabela _prisma_migrations ausente tambem cai aqui: banco sem migrações.
      return { status: 'error', detail: errorMessage(error) };
    }
  }

  /**
   * Migracoes presentes no disco. Em runtime empacotado o diretorio pode nao
   * existir; nesse caso a verificacao de pendencias e simplesmente omitida.
   */
  private migrationsOnDisk(): string[] {
    try {
      return readdirSync(join(process.cwd(), 'prisma', 'migrations'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }
}
