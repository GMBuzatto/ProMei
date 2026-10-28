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

interface ErrorResponse {
  code?: string;
  message: string;
}

const CONTAINER_TIMEOUT_MS = 120_000;

/**
 * Contenção acima do `lock_timeout` (docs/30#concorrência) — um dos dois
 * cenários que "quebram implementação ingênua": contenção virando 500 em
 * vez de 409.
 *
 * Arquivo PRÓPRIO, com `SALES_LOCK_TIMEOUT_MS` minúsculo de propósito: é o
 * único teste da suíte que precisa que o Postgres realmente estoure o
 * timeout e devolva `55P03`, sem segurar a suíte inteira por isso — e sem
 * competir pelo mesmo orçamento de tempo que a numeração de 10 vendas
 * simultâneas usa em `sales-concurrency.integration.spec.ts` (essa
 * precisa de folga real para fila legítima; esta precisa do oposto).
 */
describe('Vendas — contenção acima do lock_timeout (409, nunca 500)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let storageDir: string;

  let company: { id: string };
  let admin: { id: string; email: string };
  let token: string;

  const password = 'SenhaValida123!';
  const LOCK_TIMEOUT_MS = 300;

  function createSale(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/sales',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function createItem(stock: number) {
    return prisma.item.create({
      data: {
        companyId: company.id,
        sku: `SKU-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
        name: 'Parafuso 3/8',
        unit: 'un',
        price: 10,
        stock,
      },
    });
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

    // Minúsculo DE PROPÓSITO: só este arquivo precisa que o Postgres
    // realmente devolva 55P03 (contenção real, não simulada).
    process.env.SALES_LOCK_TIMEOUT_MS = String(LOCK_TIMEOUT_MS);
    process.env.SALES_TRANSACTION_TIMEOUT_MS = '3000';

    storageDir = await mkdtemp(join(tmpdir(), 'promei-sales-lock-timeout-it-'));
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
      data: [{ resource: 'sales', action: 'create' }],
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

  /**
   * Prova direta, sem depender de agendamento (`Promise.all` só
   * "torceria" por contenção, sem garantia): segura a linha do item por
   * mais tempo que `SALES_LOCK_TIMEOUT_MS` noutra transação, e confirma
   * que a venda que espera recebe 409, nunca 500.
   */
  it('duas confirmações de venda com contenção acima do lock_timeout: 409, nunca 500', async () => {
    const item = await createItem(10);
    let pending!: ReturnType<typeof createSale>;

    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM items WHERE id = ${item.id}::uuid FOR UPDATE`;

        pending = createSale({
          kind: 'CASH',
          paymentMethod: 'CASH',
          items: [{ itemId: item.id, quantity: 1 }],
        });

        // Mais que LOCK_TIMEOUT_MS: tempo de sobra para o Postgres devolver
        // 55P03 para a transação que está esperando.
        await new Promise((resolve) => setTimeout(resolve, LOCK_TIMEOUT_MS + 700));
      },
      { timeout: 5_000 },
    );

    const response = await pending;

    expect(response.statusCode).toBe(409);
    expect((JSON.parse(response.body) as ErrorResponse).code).toBe('CONFLITO_DE_CONCORRENCIA');
  });
});
