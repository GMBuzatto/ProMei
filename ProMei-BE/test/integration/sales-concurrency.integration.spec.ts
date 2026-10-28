import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SubscriptionStatus } from '../../src/generated/prisma/client';
import { PasswordService } from '../../src/modules/auth/password.service';
import { createFastifyAdapter } from '../../src/shared/http';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import type { AuthResponseDto } from '../../src/modules/auth/dto/auth-response.dto';

interface SaleResponse {
  id: string;
  number: string;
  status: string;
  receipt: { id: string; number: string } | null;
}

const CONTAINER_TIMEOUT_MS = 120_000;

/**
 * Testes de concorrência (docs/30#concorrência): transações reais e
 * paralelismo controlado, sem `sleep` para "torcer" por uma corrida.
 *
 * Timeouts PADRÃO de propósito (nada de `SALES_LOCK_TIMEOUT_MS` reduzido
 * aqui): a numeração de 10 vendas simultâneas serializa de verdade na
 * numeração (advisory lock) e precisa de folga real para não confundir
 * fila legítima com contenção. O teste de "409, nunca 500" — que QUER um
 * timeout minúsculo para provocar contenção de propósito — vive em
 * `sales-lock-timeout.integration.spec.ts`, com seu próprio app.
 */
describe('Vendas — concorrência (estoque, limite, deadlock, numeração)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let storageDir: string;

  let company: { id: string };
  let admin: { id: string; email: string };
  let token: string;

  const password = 'SenhaValida123!';

  function createSale(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/sales',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function createItem(stock: number, price = 10) {
    return prisma.item.create({
      data: {
        companyId: company.id,
        sku: `SKU-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
        name: 'Parafuso 3/8',
        unit: 'un',
        price,
        stock,
      },
    });
  }

  async function createCustomer(creditLimit: number) {
    return prisma.customer.create({
      data: { companyId: company.id, name: 'Cliente Teste', creditLimit },
    });
  }

  async function stockOf(itemId: string): Promise<number> {
    return (await prisma.item.findUniqueOrThrow({ where: { id: itemId } })).stock;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('promei')
      .withUsername('promei')
      .withPassword('promei')
      .start();

    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-nao-e-segredo-real';
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-nao-e-segredo-real';

    storageDir = await mkdtemp(join(tmpdir(), 'promei-sales-concurrency-it-'));
    process.env.RECEIPT_STORAGE_DIR = storageDir;

    execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit' });

    const { AppModule } = await import('../../src/app.module.js');
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('/api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    passwordService = moduleRef.get<PasswordService>(PasswordService);
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.saleItem.deleteMany({});
    await prisma.receipt.deleteMany({});
    await prisma.sale.deleteMany({});
    await prisma.item.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.userRole.deleteMany({});
    await prisma.rolePermission.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
    await prisma.companyFinanceSettings.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.company.deleteMany({});
    await prisma.plan.deleteMany({});
    await prisma.permission.deleteMany({});

    company = await prisma.company.create({
      data: { name: 'Empresa Teste', document: `doc-${Date.now()}` },
    });

    await prisma.companyFinanceSettings.create({
      data: {
        companyId: company.id,
        closingDay: 15,
        timezone: 'America/Sao_Paulo',
        delinquencyDays: 30,
        defaultDueDays: 30,
      },
    });

    const plan = await prisma.plan.create({
      data: { name: `Starter ${Date.now()}`, price: 49.9, period: 'monthly', limits: {} },
    });

    await prisma.subscription.create({
      data: {
        companyId: company.id,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        renewsAt: new Date('2027-01-01'),
      },
    });

    const permissions = await prisma.permission.createManyAndReturn({
      data: [
        { resource: 'sales', action: 'create' },
        { resource: 'sales', action: 'read' },
      ],
    });
    const adminRole = await prisma.role.create({
      data: { companyId: company.id, name: 'Admin', isSystem: true },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission: { id: string }) => ({
        roleId: adminRole.id,
        permissionId: permission.id,
      })),
    });

    admin = await prisma.user.create({
      data: {
        email: `admin-${Date.now()}@teste.com`,
        passwordHash: await passwordService.hashPassword(password),
        companyId: company.id,
      },
    });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: admin.email, password },
    });
    token = (JSON.parse(login.body) as AuthResponseDto).accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  }, CONTAINER_TIMEOUT_MS);

  describe('Estoque', () => {
    it('estoque 10, duas vendas de 8 simultâneas: uma passa, outra 422 com o saldo real; estoque final 2', async () => {
      const item = await createItem(10);

      const [first, second] = await Promise.all([
        createSale({
          kind: 'CASH',
          paymentMethod: 'CASH',
          items: [{ itemId: item.id, quantity: 8 }],
        }),
        createSale({
          kind: 'CASH',
          paymentMethod: 'CASH',
          items: [{ itemId: item.id, quantity: 8 }],
        }),
      ]);

      expect([first.statusCode, second.statusCode].sort((a, b) => a - b)).toEqual([201, 422]);
      expect(await stockOf(item.id)).toBe(2);
    });

    it('estoque 10, duas vendas de 5 simultâneas: as duas passam; estoque final 0', async () => {
      const item = await createItem(10);

      const [first, second] = await Promise.all([
        createSale({
          kind: 'CASH',
          paymentMethod: 'CASH',
          items: [{ itemId: item.id, quantity: 5 }],
        }),
        createSale({
          kind: 'CASH',
          paymentMethod: 'CASH',
          items: [{ itemId: item.id, quantity: 5 }],
        }),
      ]);

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(await stockOf(item.id)).toBe(0);
    });
  });

  describe('Limite de crédito', () => {
    it('limite 1000, duas vendas a prazo de 600 do mesmo cliente: uma passa, outra bloqueada; utilizado 600', async () => {
      const item = await createItem(100, 600);
      const customer = await createCustomer(1000);
      const payload = {
        kind: 'CREDIT',
        customerId: customer.id,
        dueDate: '2027-01-15',
        items: [{ itemId: item.id, quantity: 1 }],
      };

      const [first, second] = await Promise.all([createSale(payload), createSale(payload)]);

      expect([first.statusCode, second.statusCode].sort((a, b) => a - b)).toEqual([201, 422]);

      const approved = await prisma.sale.findMany({ where: { customerId: customer.id } });
      expect(approved).toHaveLength(1);
      expect(approved[0]!.total.toString()).toBe('600');
    });

    it('limite 1000, duas vendas de 500 do mesmo cliente: as duas passam; utilizado 1000', async () => {
      const item = await createItem(100, 500);
      const customer = await createCustomer(1000);
      const payload = {
        kind: 'CREDIT',
        customerId: customer.id,
        dueDate: '2027-01-15',
        items: [{ itemId: item.id, quantity: 1 }],
      };

      const [first, second] = await Promise.all([createSale(payload), createSale(payload)]);

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);

      const sales = await prisma.sale.findMany({ where: { customerId: customer.id } });
      const total = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
      expect(total).toBe(1000);
    });
  });

  describe('Deadlock', () => {
    it('duas vendas dos mesmos dois itens em ordem inversa: nenhum deadlock (ORDER BY id)', async () => {
      const itemX = await createItem(10);
      const itemY = await createItem(10);

      const [first, second] = await Promise.all([
        createSale({
          kind: 'CASH',
          paymentMethod: 'CASH',
          items: [
            { itemId: itemX.id, quantity: 2 },
            { itemId: itemY.id, quantity: 2 },
          ],
        }),
        createSale({
          kind: 'CASH',
          paymentMethod: 'CASH',
          items: [
            { itemId: itemY.id, quantity: 2 },
            { itemId: itemX.id, quantity: 2 },
          ],
        }),
      ]);

      // Se travasse em ordens diferentes, uma das duas estouraria
      // CONFLITO_DE_CONCORRENCIA por deadlock (55P03/40P01) em vez de
      // completar — aqui as duas devem terminar, sempre.
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(await stockOf(itemX.id)).toBe(6);
      expect(await stockOf(itemY.id)).toBe(6);
    });
  });

  describe('Numeração', () => {
    it('10 vendas simultâneas na mesma empresa: 10 números de venda e 10 de comprovante, sem buraco e sem repetição', async () => {
      const items = await Promise.all(Array.from({ length: 10 }, () => createItem(5)));

      const responses = await Promise.all(
        items.map((item) =>
          createSale({
            kind: 'CASH',
            paymentMethod: 'CASH',
            items: [{ itemId: item.id, quantity: 1 }],
          }),
        ),
      );

      for (const response of responses) {
        expect(response.statusCode).toBe(201);
      }

      const sales = responses.map((response) => JSON.parse(response.body) as SaleResponse);

      const saleNumbers = sales.map((sale) => Number(sale.number)).sort((a, b) => a - b);
      expect(saleNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const receiptNumbers = sales
        .map((sale) => Number(sale.receipt!.number))
        .sort((a, b) => a - b);
      expect(receiptNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      // Sem repetição também na PERSISTÊNCIA, não só na resposta.
      expect(new Set(saleNumbers).size).toBe(10);
      expect(new Set(receiptNumbers).size).toBe(10);
      expect(await prisma.sale.count({ where: { companyId: company.id } })).toBe(10);
      expect(await prisma.receipt.count({ where: { companyId: company.id } })).toBe(10);
    });
  });
});
