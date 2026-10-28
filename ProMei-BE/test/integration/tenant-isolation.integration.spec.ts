import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/client';
import { runWithTenantContext, setTenantContext } from '../../src/shared/tenant/tenant-context';
import { tenantExtension } from '../../src/shared/tenant/tenant.extension';

const CONTAINER_TIMEOUT_MS = 120_000;

/**
 * Teste de isolamento cross-tenant (ADR-0003, docs/09 — risco nº 1 do produto).
 *
 * Roda na camada de dados, contra Postgres real: prova que a Client Extension
 * impede acesso a registro de outra empresa mesmo quando a query é escrita
 * "errada" de propósito (sem filtro, ou com o companyId do vizinho).
 *
 * É deliberadamente independente de HTTP: o isolamento tem que valer para
 * QUALQUER caminho de código, não só para as rotas que existem hoje.
 */
describe('Isolamento cross-tenant (inegociável)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let scoped: PrismaClient;

  let companyA: { id: string };
  let companyB: { id: string };
  let itemOfCompanyA: { id: string };
  let itemOfCompanyB: { id: string };

  /** Executa o callback como se fosse uma requisição daquela empresa. */
  async function asCompany<T>(companyId: string, callback: () => Promise<T>): Promise<T> {
    return runWithTenantContext({}, async () => {
      setTenantContext({ companyId, userId: 'user-teste', isPlatformUser: false });
      return callback();
    });
  }

  /** Executa como Super Admin/Staff: sem company_id (RN-05). */
  async function asPlatform<T>(callback: () => Promise<T>): Promise<T> {
    return runWithTenantContext({}, async () => {
      setTenantContext({ companyId: null, userId: 'staff-1', isPlatformUser: true });
      return callback();
    });
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('promei')
      .withUsername('promei')
      .withPassword('promei')
      .start();

    process.env.DATABASE_URL = container.getConnectionUri();
    execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit' });

    const adapter = new PrismaPg({ connectionString: container.getConnectionUri() });
    prisma = new PrismaClient({ adapter });
    scoped = prisma.$extends(tenantExtension()) as unknown as PrismaClient;
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(async () => {
    // Limpeza sem escopo: usa o client cru de propósito.
    await prisma.stockMovement.deleteMany({});
    await prisma.item.deleteMany({});
    await prisma.userRole.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
    await prisma.company.deleteMany({});

    companyA = await prisma.company.create({
      data: { name: 'Empresa A', document: `doc_a_${Date.now()}` },
    });
    companyB = await prisma.company.create({
      data: { name: 'Empresa B', document: `doc_b_${Date.now()}` },
    });

    itemOfCompanyA = await prisma.item.create({
      data: { companyId: companyA.id, name: 'Item A', unit: 'un', price: 10, sku: 'SKU-A' },
    });
    itemOfCompanyB = await prisma.item.create({
      data: { companyId: companyB.id, name: 'Item B', unit: 'un', price: 20, sku: 'SKU-B' },
    });
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (container) await container.stop();
  }, CONTAINER_TIMEOUT_MS);

  describe('leitura', () => {
    it('findMany sem filtro só devolve dados da própria empresa', async () => {
      const items = await asCompany(companyA.id, () => scoped.item.findMany({}));

      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe(itemOfCompanyA.id);
    });

    it('findMany pedindo explicitamente a outra empresa devolve vazio', async () => {
      const items = await asCompany(companyA.id, () =>
        scoped.item.findMany({ where: { companyId: companyB.id } }),
      );

      expect(items).toEqual([]);
    });

    it('findUnique por id de item alheio devolve null (não vaza o registro)', async () => {
      const item = await asCompany(companyA.id, () =>
        scoped.item.findUnique({ where: { id: itemOfCompanyB.id } }),
      );

      expect(item).toBeNull();
    });

    it('findFirst por id alheio devolve null', async () => {
      const item = await asCompany(companyA.id, () =>
        scoped.item.findFirst({ where: { id: itemOfCompanyB.id } }),
      );

      expect(item).toBeNull();
    });

    it('count conta apenas a própria empresa', async () => {
      const total = await asCompany(companyA.id, () => scoped.item.count({}));
      expect(total).toBe(1);
    });
  });

  describe('escrita', () => {
    it('create grava com o companyId do contexto, ignorando o informado', async () => {
      const createdRecord = await asCompany(companyA.id, () =>
        scoped.item.create({
          data: { companyId: companyB.id, name: 'Tentativa', unit: 'un', price: 1, sku: 'X1' },
        }),
      );

      expect(createdRecord.companyId).toBe(companyA.id);
    });

    it('updateMany não alcança registro de outra empresa', async () => {
      const result = await asCompany(companyA.id, () =>
        scoped.item.updateMany({ where: {}, data: { name: 'Renomeado' } }),
      );

      expect(result.count).toBe(1);

      const intact = await prisma.item.findUnique({ where: { id: itemOfCompanyB.id } });
      expect(intact?.name).toBe('Item B');
    });

    it('deleteMany sem where não apaga dados de outra empresa', async () => {
      await asCompany(companyA.id, () => scoped.item.deleteMany({ where: {} }));

      const remaining = await prisma.item.findMany({});
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.id).toBe(itemOfCompanyB.id);
    });
  });

  describe('usuário de plataforma (Super Admin/Staff)', () => {
    it('enxerga todas as empresas — é o propósito das rotas de plataforma', async () => {
      const items = await asPlatform(() => scoped.item.findMany({}));
      expect(items).toHaveLength(2);
    });
  });

  describe('sem contexto de requisição', () => {
    it('não filtra — cobre seed, migrações e o login antes da autenticação', async () => {
      const items = await scoped.item.findMany({});
      expect(items).toHaveLength(2);
    });
  });

  describe('models globais', () => {
    it('Permission não sofre escopo (não tem company_id)', async () => {
      await prisma.permission.createMany({
        data: [
          { resource: 'items', action: 'read' },
          { resource: 'items', action: 'create' },
        ],
      });

      const permissions = await asCompany(companyA.id, () => scoped.permission.findMany({}));
      expect(permissions.length).toBeGreaterThanOrEqual(2);
    });
  });
});
