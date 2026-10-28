import { execSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/client';

const CONTAINER_TIMEOUT_MS = 120_000;

/** Papel que SOFRE as policies (ADR-0003). Não é superusuário. */
const RESTRICTED_ROLE = 'promei_app';
/** Senha só deste container efêmero — provisionada pelo próprio teste. */
const RESTRICTED_PASSWORD = 'rls-test-role-password';

interface ItemRow {
  id: string;
  company_id: string;
  name: string;
}

/**
 * Row-Level Security — segunda barreira (ADR-0003, docs/09).
 *
 * Roda SQL cru com o papel **promei_app**, que não é superusuário. Isso é
 * essencial: superusuário ignora RLS mesmo com FORCE, então testar com o
 * usuário padrão do container daria falso positivo — foi exatamente o que
 * aconteceu na primeira versão deste teste.
 *
 * O contrato das policies é: sem `app.current_company_id` e sem
 * `app.platform_access`, nenhuma linha é visível.
 */
describe('Row-Level Security (segunda barreira)', () => {
  let container: StartedPostgreSqlContainer;
  /** Conecta como promei_app (sem superuser) — é quem sofre as policies. */
  let prisma: PrismaClient;
  /** Conecta como owner, apenas para preparar dados sem esbarrar no RLS. */
  let admin: PrismaClient;

  let companyA: string;
  let companyB: string;

  /** Roda SQL dentro de uma transação com o contexto de tenant publicado. */
  async function asTenant(companyId: string, sql: string): Promise<ItemRow[]> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_company_id', ${companyId}, true)`;
      return tx.$queryRawUnsafe<ItemRow[]>(sql);
    });
  }

  async function asPlatform(sql: string): Promise<ItemRow[]> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform_access', 'on', true)`;
      return tx.$queryRawUnsafe<ItemRow[]>(sql);
    });
  }

  /** Sem nenhum contexto — é o cenário do acesso direto ao banco. */
  async function withoutContext(sql: string): Promise<ItemRow[]> {
    return prisma.$queryRawUnsafe<ItemRow[]>(sql);
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('promei')
      .withUsername('promei')
      .withPassword('promei')
      .start();

    process.env.DATABASE_URL = container.getConnectionUri();
    execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit' });

    admin = new PrismaClient({
      adapter: new PrismaPg({ connectionString: container.getConnectionUri() }),
    });

    // A senha do papel restrito é provisionada AQUI, pelo owner, e não vem de
    // migração.
    //
    // A migração que criou o papel definia uma senha de desenvolvimento, e a
    // 20260903090000 apenas o renomeou — RENAME preserva a senha (scram-sha-256
    // não embute o nome do papel), então o papel `promei_app` continuaria com
    // a senha antiga. Em vez de acorrentar o teste a esse detalhe histórico, ele
    // define a credencial que vai usar.
    //
    // Isso também é o comportamento correto para produção: senha de papel de
    // banco é provisionamento (`bootstrap-db.ts`, DB_APP_ROLE_PASSWORD), não
    // migração. Migração que fixa senha conhecida sobrescreveria a senha forte
    // do ambiente gerenciado no primeiro `migrate deploy`.
    await admin.$executeRawUnsafe(
      `ALTER ROLE ${RESTRICTED_ROLE} WITH PASSWORD '${RESTRICTED_PASSWORD}'`,
    );

    const restrictedUri = container
      .getConnectionUri()
      .replace('promei:promei@', `${RESTRICTED_ROLE}:${RESTRICTED_PASSWORD}@`);

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: restrictedUri }),
    });
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(async () => {
    // Preparo com o owner (superusuário), que não sofre RLS.
    await admin.$executeRawUnsafe('DELETE FROM stock_movements');
    await admin.$executeRawUnsafe('DELETE FROM items');
    await admin.$executeRawUnsafe('DELETE FROM customers');
    await admin.$executeRawUnsafe('DELETE FROM users');
    await admin.$executeRawUnsafe('DELETE FROM roles');
    await admin.$executeRawUnsafe('DELETE FROM companies');

    const createdRecords = await admin.$queryRawUnsafe<{ id: string }[]>(`
      INSERT INTO companies (id, name, document, status, created_at, updated_at)
      VALUES (gen_random_uuid(), 'Empresa A', 'doc-a-${Date.now()}', 'ACTIVE', now(), now()),
             (gen_random_uuid(), 'Empresa B', 'doc-b-${Date.now()}', 'ACTIVE', now(), now())
      RETURNING id
    `);

    companyA = createdRecords[0]!.id;
    companyB = createdRecords[1]!.id;

    await admin.$executeRawUnsafe(`
      INSERT INTO items (id, company_id, sku, name, unit, price, stock, min_stock, status, created_at, updated_at)
      VALUES (gen_random_uuid(), '${companyA}', 'SKU-A', 'Item A', 'un', 10, 0, 0, 'ACTIVE', now(), now()),
             (gen_random_uuid(), '${companyB}', 'SKU-B', 'Item B', 'un', 20, 0, 0, 'ACTIVE', now(), now())
    `);

    // docs/18, docs/27: Customer entra em TENANT_SCOPED_MODELS e ganha
    // policy própria — precisa da mesma cobertura de RLS que items já tem.
    await admin.$executeRawUnsafe(`
      INSERT INTO customers (id, company_id, name, credit_limit, status, financial_status, blocked_for_credit, created_at, updated_at)
      VALUES (gen_random_uuid(), '${companyA}', 'Cliente A', 0, 'ACTIVE', 'REGULAR', false, now(), now()),
             (gen_random_uuid(), '${companyB}', 'Cliente B', 0, 'ACTIVE', 'REGULAR', false, now(), now())
    `);
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (admin) await admin.$disconnect();
    if (container) await container.stop();
  }, CONTAINER_TIMEOUT_MS);

  describe('sem contexto de tenant (SQL direto)', () => {
    it('SELECT sem filtro não devolve NENHUMA linha — nem da própria empresa', async () => {
      const items = await withoutContext('SELECT id, company_id, name FROM items');
      expect(items).toEqual([]);
    });

    it('SELECT com company_id explícito também não devolve nada', async () => {
      const items = await withoutContext(
        `SELECT id, company_id, name FROM items WHERE company_id = '${companyB}'`,
      );
      expect(items).toEqual([]);
    });

    it('vale para as demais tabelas de negócio', async () => {
      for (const table of [
        'companies',
        'users',
        'roles',
        'stock_movements',
        'audit_logs',
        'customers',
      ]) {
        const rows = await withoutContext(`SELECT * FROM ${table}`);
        expect(rows, `tabela ${table} vazou sem contexto`).toEqual([]);
      }
    });
  });

  describe('com contexto de tenant', () => {
    it('enxerga apenas os próprios dados', async () => {
      const items = await asTenant(companyA, 'SELECT id, company_id, name FROM items');

      expect(items).toHaveLength(1);
      expect(items[0]?.company_id).toBe(companyA);
    });

    it('pedir explicitamente a outra empresa não devolve nada', async () => {
      const items = await asTenant(
        companyA,
        `SELECT id, company_id, name FROM items WHERE company_id = '${companyB}'`,
      );
      expect(items).toEqual([]);
    });

    it('não consegue inserir registro para outra empresa (WITH CHECK)', async () => {
      await expect(
        asTenant(
          companyA,
          `INSERT INTO items (id, company_id, sku, name, unit, price, stock, min_stock, status, created_at, updated_at)
           VALUES (gen_random_uuid(), '${companyB}', 'SKU-X', 'Invasor', 'un', 1, 0, 0, 'ACTIVE', now(), now())`,
        ),
      ).rejects.toThrow();
    });

    it('UPDATE não alcança registro de outra empresa', async () => {
      await asTenant(companyA, `UPDATE items SET name = 'Renomeado'`);

      const fromOtherCompany = await asTenant(companyB, 'SELECT id, company_id, name FROM items');
      expect(fromOtherCompany[0]?.name).toBe('Item B');
    });

    it('DELETE sem where não apaga dados de outra empresa', async () => {
      await asTenant(companyA, 'DELETE FROM items');

      const remaining = await asPlatform('SELECT id, company_id, name FROM items');
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.company_id).toBe(companyB);
    });
  });

  /** docs/18, docs/27 — RN-30: cliente nunca é visível a outra empresa. */
  describe('customers (RN-30)', () => {
    it('enxerga apenas os próprios clientes', async () => {
      const customers = await asTenant(companyA, 'SELECT id, company_id, name FROM customers');

      expect(customers).toHaveLength(1);
      expect(customers[0]?.company_id).toBe(companyA);
    });

    it('não consegue inserir cliente para outra empresa (WITH CHECK)', async () => {
      await expect(
        asTenant(
          companyA,
          `INSERT INTO customers (id, company_id, name, credit_limit, status, financial_status, blocked_for_credit, created_at, updated_at)
           VALUES (gen_random_uuid(), '${companyB}', 'Invasor', 0, 'ACTIVE', 'REGULAR', false, now(), now())`,
        ),
      ).rejects.toThrow();
    });
  });

  describe('acesso de plataforma', () => {
    it('Super Admin/Staff enxerga todas as empresas', async () => {
      const items = await asPlatform('SELECT id, company_id, name FROM items');
      expect(items).toHaveLength(2);
    });
  });

  describe('vazamento entre requisições', () => {
    it('o contexto morre com a transação — a próxima query não herda o tenant', async () => {
      await asTenant(companyA, 'SELECT id, company_id, name FROM items');

      const withoutTenantAfter = await withoutContext('SELECT id, company_id, name FROM items');
      expect(withoutTenantAfter).toEqual([]);
    });
  });
});
