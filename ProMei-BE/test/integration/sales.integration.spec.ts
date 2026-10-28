import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ItemStatus, SubscriptionStatus } from '../../src/generated/prisma/client';
import { PasswordService } from '../../src/modules/auth/password.service';
import { createFastifyAdapter } from '../../src/shared/http';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import type { AuthResponseDto } from '../../src/modules/auth/dto/auth-response.dto';

interface ErrorResponse {
  code?: string;
  message: string;
  blocks?: { reason: string; authorizable: boolean; details: unknown }[];
}

interface SaleItemResponse {
  itemId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: string;
  total: string;
  stockAfter?: number;
}

interface SaleResponse {
  id: string;
  number: string;
  formattedNumber: string;
  kind: string;
  status: string;
  customer: { id: string; name: string } | null;
  total: string;
  paidAmount: string;
  balance: string;
  dueDate: string | null;
  soldAt: string;
  period: { label: string; start: string; end: string };
  items: SaleItemResponse[];
  authorizations: unknown[];
  receipt: { id: string; number: string; pdfStatus: string; pdfUrl: string | null } | null;
  payments?: { id: string; amount: string; method: string; paidAt: string }[];
}

interface ListResponse {
  data: SaleResponse[];
  total: number;
  page: number;
  limit: number;
}

const CONTAINER_TIMEOUT_MS = 120_000;

/** Venda à vista completa (docs/19, docs/28, ADR-0006, RN-40 a RN-47, RN-80 a RN-86). */
describe('Vendas — venda à vista (POST /sales, GET /sales, GET /sales/:id)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let storageDir: string;

  let company: { id: string };
  let admin: { id: string; email: string };
  let token: string;

  const password = 'SenhaValida123!';

  function createSale(payload: Record<string, unknown>, useToken = token) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/sales',
      headers: { authorization: `Bearer ${useToken}` },
      payload,
    });
  }

  async function createSaleOk(payload: Record<string, unknown>): Promise<SaleResponse> {
    const response = await createSale(payload);
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body) as SaleResponse;
  }

  function listSales(query = '') {
    return app.inject({
      method: 'GET',
      url: `/api/v1/sales${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function getSale(id: string, useToken = token) {
    return app.inject({
      method: 'GET',
      url: `/api/v1/sales/${id}`,
      headers: { authorization: `Bearer ${useToken}` },
    });
  }

  /** Item criado direto no banco: o saldo inicial não passa pela API. */
  async function createItem(stock = 10, overrides: { price?: number; status?: ItemStatus } = {}) {
    return prisma.item.create({
      data: {
        companyId: company.id,
        sku: `SKU-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
        name: 'Parafuso 3/8',
        unit: 'un',
        price: overrides.price ?? 10,
        stock,
        status: overrides.status ?? ItemStatus.ACTIVE,
      },
    });
  }

  async function stockOf(itemId: string): Promise<number> {
    return (await prisma.item.findUniqueOrThrow({ where: { id: itemId } })).stock;
  }

  /** Cliente criado direto no banco: o cadastro não passa pela API. */
  async function createCustomer(overrides: Record<string, unknown> = {}) {
    return prisma.customer.create({
      data: {
        companyId: company.id,
        name: 'Cliente Teste',
        creditLimit: 1000,
        ...overrides,
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

    storageDir = await mkdtemp(join(tmpdir(), 'promei-sales-it-'));
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
      data: {
        name: `Starter ${Date.now()}`,
        price: 49.9,
        period: 'monthly',
        limits: { maxUsers: 10, maxItems: 100 },
      },
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

  describe('POST /sales — venda à vista', () => {
    it('nasce PAID, com Payment de valor total, baixa estoque e gera comprovante PENDING', async () => {
      const item = await createItem(10, { price: 25 });

      const sale = await createSaleOk({
        kind: 'CASH',
        paymentMethod: 'PIX',
        items: [{ itemId: item.id, quantity: 2 }],
      });

      expect(sale.kind).toBe('CASH');
      expect(sale.status).toBe('PAID');
      expect(sale.total).toBe('50.00');
      expect(sale.paidAmount).toBe('50.00');
      expect(sale.balance).toBe('0.00');
      expect(sale.customer).toBeNull();
      expect(sale.dueDate).toBeNull();
      expect(sale.items).toEqual([
        expect.objectContaining({
          itemId: item.id,
          quantity: 2,
          unitPrice: '25.00',
          total: '50.00',
          stockAfter: 8,
        }) as unknown,
      ]);
      expect(sale.receipt).toMatchObject({ pdfStatus: 'PENDING', pdfUrl: null });

      expect(await stockOf(item.id)).toBe(8);

      const payments = await prisma.payment.findMany({ where: { saleId: sale.id } });
      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({ amount: expect.anything() as unknown, method: 'PIX' });
      expect(payments[0]!.amount.toString()).toBe('50');

      const movements = await prisma.stockMovement.findMany({ where: { saleId: sale.id } });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({ origin: 'SALE', type: 'OUT', quantity: 2 });
    });

    /**
     * O PDF é gerado em background (docs/06). Aqui provamos que o
     * `ReceiptsService` aprendeu a forma "venda" (docs/23#impacto-no-comprovante):
     * sem isso, `loadPdfData` lançaria "sem movimentação nem venda vinculada"
     * e o comprovante ficaria pendente para sempre.
     */
    it('o comprovante da venda vira READY assim que o PDF em background termina', async () => {
      const item = await createItem(5, { price: 12.5 });
      const sale = await createSaleOk({
        kind: 'CASH',
        paymentMethod: 'CASH',
        items: [{ itemId: item.id, quantity: 2 }],
      });

      const deadline = Date.now() + 5_000;
      let receipt = await prisma.receipt.findUniqueOrThrow({ where: { id: sale.receipt!.id } });
      while (!receipt.pdfUrl && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        receipt = await prisma.receipt.findUniqueOrThrow({ where: { id: sale.receipt!.id } });
      }

      expect(receipt.pdfUrl).not.toBeNull();
      expect(receipt.saleId).toBe(sale.id);
    });

    it('usa items.price quando unitPrice não é informado', async () => {
      const item = await createItem(10, { price: 19.9 });

      const sale = await createSaleOk({
        kind: 'CASH',
        paymentMethod: 'CASH',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(sale.items[0]!.unitPrice).toBe('19.90');
    });

    it('aceita unitPrice negociado no balcão, diferente do cadastro', async () => {
      const item = await createItem(10, { price: 25 });

      const sale = await createSaleOk({
        kind: 'CASH',
        paymentMethod: 'CASH',
        items: [{ itemId: item.id, quantity: 1, unitPrice: 20 }],
      });

      expect(sale.items[0]!.unitPrice).toBe('20.00');
    });

    it('consolida a mesma linha repetida para validar saldo (RN-83), mas grava as duas linhas', async () => {
      const item = await createItem(10, { price: 5 });

      const sale = await createSaleOk({
        kind: 'CASH',
        paymentMethod: 'CASH',
        items: [
          { itemId: item.id, quantity: 6 },
          { itemId: item.id, quantity: 4 },
        ],
      });

      expect(sale.items).toHaveLength(2);
      expect(await stockOf(item.id)).toBe(0);
    });

    it('aplica desconto sobre a soma dos itens', async () => {
      const item = await createItem(10, { price: 50 });

      const sale = await createSaleOk({
        kind: 'CASH',
        paymentMethod: 'CASH',
        discount: 10,
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(sale.total).toBe('40.00');
      expect(sale.paidAmount).toBe('40.00');
    });

    it('desconto maior ou igual à soma dos itens é 400 VALIDACAO_FALHOU', async () => {
      const item = await createItem(10, { price: 10 });

      const response = await createSale({
        kind: 'CASH',
        paymentMethod: 'CASH',
        discount: 10,
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(400);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('VALIDACAO_FALHOU');
    });

    it('estoque insuficiente: 422 VENDA_BLOQUEADA com blocks e nada é gravado', async () => {
      const item = await createItem(3);

      const response = await createSale({
        kind: 'CASH',
        paymentMethod: 'CASH',
        items: [{ itemId: item.id, quantity: 8 }],
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.code).toBe('VENDA_BLOQUEADA');
      expect(body.blocks).toEqual([
        expect.objectContaining({
          reason: 'INSUFFICIENT_STOCK',
          authorizable: false,
        }) as unknown,
      ]);

      expect(await stockOf(item.id)).toBe(3);
      expect(await prisma.sale.count()).toBe(0);
      expect(await prisma.payment.count()).toBe(0);
      expect(await prisma.stockMovement.count()).toBe(0);
    });

    it('item inativo: 422 VENDA_BLOQUEADA', async () => {
      const item = await createItem(10, { status: ItemStatus.INACTIVE });

      const response = await createSale({
        kind: 'CASH',
        paymentMethod: 'CASH',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.code).toBe('VENDA_BLOQUEADA');
      expect(body.blocks?.[0]).toMatchObject({ reason: 'ITEM_INACTIVE', authorizable: false });
    });

    it('item de outra empresa: 404 (nunca informa que existe alhures)', async () => {
      const otherCompany = await prisma.company.create({
        data: { name: 'Outra Empresa', document: `doc-b-${Date.now()}` },
      });
      const foreignItem = await prisma.item.create({
        data: {
          companyId: otherCompany.id,
          sku: 'SKU-ALHEIO',
          name: 'Item de outra empresa',
          unit: 'un',
          price: 10,
          stock: 10,
        },
      });

      const response = await createSale({
        kind: 'CASH',
        paymentMethod: 'CASH',
        items: [{ itemId: foreignItem.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(404);
    });

    it('kind CREDIT ainda não é aceito nesta versão da API (400)', async () => {
      const item = await createItem(10);

      const response = await createSale({
        kind: 'CREDIT',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(400);
    });

    it('sem items é 400', async () => {
      expect(
        (await createSale({ kind: 'CASH', paymentMethod: 'CASH', items: [] })).statusCode,
      ).toBe(400);
    });
  });

  describe('POST /sales — venda a prazo (docs/19, docs/20, docs/21)', () => {
    it('nasce PENDING, paidAmount zero, sem Payment, consumindo o limite do período', async () => {
      const item = await createItem(10, { price: 100 });
      const customer = await createCustomer({ creditLimit: 1000 });

      const sale = await createSaleOk({
        kind: 'CREDIT',
        customerId: customer.id,
        dueDate: '2027-01-15',
        items: [{ itemId: item.id, quantity: 2 }],
      });

      expect(sale.kind).toBe('CREDIT');
      expect(sale.status).toBe('PENDING');
      expect(sale.total).toBe('200.00');
      expect(sale.paidAmount).toBe('0.00');
      expect(sale.balance).toBe('200.00');
      expect(sale.dueDate).toBe('2027-01-15');
      expect(sale.customer).toMatchObject({ id: customer.id, name: 'Cliente Teste' });

      expect(await prisma.payment.count({ where: { saleId: sale.id } })).toBe(0);
      expect(await stockOf(item.id)).toBe(8);
    });

    it('dueDate omitido usa o prazo padrão da empresa sobre soldAt', async () => {
      const item = await createItem(10);
      const customer = await createCustomer();

      const before = Date.now();
      const sale = await createSaleOk({
        kind: 'CREDIT',
        customerId: customer.id,
        items: [{ itemId: item.id, quantity: 1 }],
      });

      // defaultDueDays = 30 (beforeEach). Confere a janela, sem acoplar ao
      // milissegundo exato do teste.
      const dueDateMs = new Date(sale.dueDate!).getTime();
      const expectedMs = before + 30 * 86_400_000;
      expect(Math.abs(dueDateMs - expectedMs)).toBeLessThan(2 * 86_400_000);
    });

    it('dueDate no passado é 400 VALIDACAO_FALHOU', async () => {
      const item = await createItem(10);
      const customer = await createCustomer();

      const response = await createSale({
        kind: 'CREDIT',
        customerId: customer.id,
        dueDate: '2020-01-01',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(400);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('VALIDACAO_FALHOU');
    });

    it('sem customerId é 400 (RN-41)', async () => {
      const item = await createItem(10);

      const response = await createSale({
        kind: 'CREDIT',
        dueDate: '2027-01-15',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(400);
    });

    it('cliente de outra empresa: 404, nunca 403 (docs/29)', async () => {
      const item = await createItem(10);
      const otherCompany = await prisma.company.create({
        data: { name: 'Outra Empresa', document: `doc-cred-${Date.now()}` },
      });
      const foreignCustomer = await prisma.customer.create({
        data: { companyId: otherCompany.id, name: 'Cliente Alheio', creditLimit: 1000 },
      });

      const response = await createSale({
        kind: 'CREDIT',
        customerId: foreignCustomer.id,
        dueDate: '2027-01-15',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(404);
    });

    it('total acima do limite disponível: 422 VENDA_BLOQUEADA com INSUFFICIENT_LIMIT', async () => {
      const item = await createItem(10, { price: 100 });
      const customer = await createCustomer({ creditLimit: 500 });

      const response = await createSale({
        kind: 'CREDIT',
        customerId: customer.id,
        dueDate: '2027-01-15',
        items: [{ itemId: item.id, quantity: 6 }], // 600 > 500
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.code).toBe('VENDA_BLOQUEADA');
      expect(body.blocks).toEqual([
        expect.objectContaining({ reason: 'INSUFFICIENT_LIMIT', authorizable: true }),
      ]);

      // Nada foi gravado: estoque intacto, nenhuma venda criada.
      expect(await stockOf(item.id)).toBe(10);
      expect(await prisma.sale.count()).toBe(0);
    });

    it('limite mede volume no período, não saldo devedor (docs/20): pagar não devolveria limite', async () => {
      const item = await createItem(20, { price: 100 });
      const customer = await createCustomer({ creditLimit: 1000 });

      // Consome 900 do limite de 1000.
      await createSaleOk({
        kind: 'CREDIT',
        customerId: customer.id,
        dueDate: '2027-01-15',
        items: [{ itemId: item.id, quantity: 9 }],
      });

      // Mais 200 estouraria (900 + 200 > 1000).
      const response = await createSale({
        kind: 'CREDIT',
        customerId: customer.id,
        dueDate: '2027-01-15',
        items: [{ itemId: item.id, quantity: 2 }],
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.blocks?.some((block) => block.reason === 'INSUFFICIENT_LIMIT')).toBe(true);
    });

    it('cliente bloqueado manualmente: 422 VENDA_BLOQUEADA com CUSTOMER_BLOCKED, não liberável', async () => {
      const item = await createItem(10);
      const customer = await createCustomer({ blockedForCredit: true });

      const response = await createSale({
        kind: 'CREDIT',
        customerId: customer.id,
        dueDate: '2027-01-15',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.blocks).toEqual([
        expect.objectContaining({ reason: 'CUSTOMER_BLOCKED', authorizable: false }),
      ]);
    });

    it('cliente inativo: 422 VENDA_BLOQUEADA com CUSTOMER_INACTIVE, não liberável', async () => {
      const item = await createItem(10);
      const customer = await createCustomer({ status: 'INACTIVE' });

      const response = await createSale({
        kind: 'CREDIT',
        customerId: customer.id,
        dueDate: '2027-01-15',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.blocks).toEqual([
        expect.objectContaining({ reason: 'CUSTOMER_INACTIVE', authorizable: false }),
      ]);
    });

    /**
     * A validação NÃO confia em `customers.financial_status`: o cadastro
     * fica REGULAR (nunca atualizado por fora), mas existe uma venda
     * vencida há mais que FINANCE_DELINQUENCY_DAYS — a decisão precisa
     * recomputar a partir das vendas, não ler o campo materializado.
     */
    it('recomputa a situação financeira a partir das vendas, mesmo com o campo materializado desatualizado', async () => {
      const item = await createItem(10, { price: 50 });
      const customer = await createCustomer({ creditLimit: 1000 });

      // Venda vencida há 40 dias, com saldo em aberto — inserida direto no
      // banco, como um fato histórico. financial_status do cliente
      // continua REGULAR (stale) de propósito.
      await prisma.sale.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          kind: 'CREDIT',
          status: 'OVERDUE',
          number: 9999,
          total: 300,
          paidAmount: 0,
          dueDate: new Date(Date.now() - 40 * 86_400_000),
          soldAt: new Date(Date.now() - 60 * 86_400_000),
          periodStart: new Date(Date.now() - 90 * 86_400_000),
          periodEnd: new Date(Date.now() + 90 * 86_400_000),
          createdBy: admin.id,
        },
      });

      expect(
        (await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).financialStatus,
      ).toBe('REGULAR');

      const response = await createSale({
        kind: 'CREDIT',
        customerId: customer.id,
        dueDate: '2027-01-15',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.blocks).toEqual([
        expect.objectContaining({ reason: 'CUSTOMER_DELINQUENT', authorizable: true }),
      ]);
    });
  });

  describe('RN-80 a RN-86 sob concorrência — SELECT FOR UPDATE', () => {
    /**
     * O cenário exato do épico 10: estoque 10, duas vendas de 8
     * simultâneas. Uma vende, a outra é bloqueada, e o estoque final é 2 —
     * nunca -6 nem 10.
     */
    it('duas vendas simultâneas de 8 sobre estoque 10: uma passa, uma 422, estoque final 2', async () => {
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

      const statuses = [first.statusCode, second.statusCode].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 422]);

      const rejected = first.statusCode === 422 ? first : second;
      expect((JSON.parse(rejected.body) as ErrorResponse).code).toBe('VENDA_BLOQUEADA');

      expect(await stockOf(item.id)).toBe(2);
      expect(await prisma.sale.count()).toBe(1);
      expect(await prisma.stockMovement.count({ where: { itemId: item.id } })).toBe(1);
    });

    /** Prova direta do lock, sem depender de agendamento. */
    it('a venda espera a linha do item ser liberada', async () => {
      const item = await createItem(10);
      let responded = false;
      let pending!: ReturnType<typeof createSale>;

      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM items WHERE id = ${item.id}::uuid FOR UPDATE`;

        pending = createSale({
          kind: 'CASH',
          paymentMethod: 'CASH',
          items: [{ itemId: item.id, quantity: 4 }],
        }).then((response) => {
          responded = true;
          return response;
        });

        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(responded).toBe(false);
        expect(await stockOf(item.id)).toBe(10);
      });

      const response = await pending;
      expect(response.statusCode).toBe(201);
      expect(await stockOf(item.id)).toBe(6);
    });

    /**
     * Prova do risco de deadlock do épico: duas vendas com os MESMOS dois
     * itens em ORDEM INVERSA não podem travar entre si — o lock único
     * ORDER BY id garante que as duas peguem os itens na mesma sequência.
     */
    it('duas vendas com os mesmos dois itens em ordem inversa não fazem deadlock', async () => {
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

      // Nenhuma das duas trava a outra até estourar CONFLITO_DE_CONCORRENCIA
      // por deadlock: com saldo de sobra, as duas vendas passam.
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(await stockOf(itemX.id)).toBe(6);
      expect(await stockOf(itemY.id)).toBe(6);
    });

    /**
     * O cenário exato do docs/20#concorrência e do ticket: duas vendas a
     * prazo de R$ 600 simultâneas, limite R$ 1.000. Sem o advisory lock as
     * duas leriam "utilizado = 0" e passariam, somando R$ 1.200. Estoque
     * de sobra de propósito — este teste é sobre o LIMITE, não sobre item.
     */
    it('duas vendas a prazo de R$ 600 simultâneas sobre limite R$ 1.000: uma passa, uma 422 INSUFFICIENT_LIMIT', async () => {
      const item = await createItem(100, { price: 600 });
      const customer = await createCustomer({ creditLimit: 1000 });

      const payload = {
        kind: 'CREDIT',
        customerId: customer.id,
        dueDate: '2027-01-15',
        items: [{ itemId: item.id, quantity: 1 }],
      };

      const [first, second] = await Promise.all([createSale(payload), createSale(payload)]);

      const statuses = [first.statusCode, second.statusCode].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 422]);

      const rejected = first.statusCode === 422 ? first : second;
      const body = JSON.parse(rejected.body) as ErrorResponse;
      expect(body.code).toBe('VENDA_BLOQUEADA');
      expect(body.blocks).toEqual([
        expect.objectContaining({ reason: 'INSUFFICIENT_LIMIT', authorizable: true }),
      ]);

      // Nunca as duas: uma venda só, R$ 600 utilizados — não R$ 1.200.
      expect(await prisma.sale.count({ where: { customerId: customer.id } })).toBe(1);
    });

    /** Ordem de lock fixa (cliente → itens): venda a prazo não deadlocka com CASH concorrente nos mesmos itens. */
    it('venda a prazo e venda à vista concorrentes no mesmo item não fazem deadlock', async () => {
      const item = await createItem(20, { price: 50 });
      const customer = await createCustomer({ creditLimit: 1000 });

      const [credit, cash] = await Promise.all([
        createSale({
          kind: 'CREDIT',
          customerId: customer.id,
          dueDate: '2027-01-15',
          items: [{ itemId: item.id, quantity: 3 }],
        }),
        createSale({
          kind: 'CASH',
          paymentMethod: 'CASH',
          items: [{ itemId: item.id, quantity: 3 }],
        }),
      ]);

      expect(credit.statusCode).toBe(201);
      expect(cash.statusCode).toBe(201);
      expect(await stockOf(item.id)).toBe(14);
    });
  });

  describe('GET /sales', () => {
    it('lista as vendas da própria empresa, paginado', async () => {
      const item = await createItem(10);
      await createSaleOk({
        kind: 'CASH',
        paymentMethod: 'CASH',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      const response = await listSales();
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as ListResponse;
      expect(body.total).toBe(1);
      expect(body.data[0]!.kind).toBe('CASH');
    });

    it('filtra por status', async () => {
      const item = await createItem(10);
      await createSaleOk({
        kind: 'CASH',
        paymentMethod: 'CASH',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      const paid = await listSales('?status=PAID');
      expect((JSON.parse(paid.body) as ListResponse).total).toBe(1);

      const pending = await listSales('?status=PENDING');
      expect((JSON.parse(pending.body) as ListResponse).total).toBe(0);
    });

    it('dateFrom depois de dateTo é 400', async () => {
      const response = await listSales('?dateFrom=2026-06-01&dateTo=2026-01-01');
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /sales/:id', () => {
    it('traz a venda completa com itens e pagamentos', async () => {
      const item = await createItem(10, { price: 30 });
      const created = await createSaleOk({
        kind: 'CASH',
        paymentMethod: 'DEBIT_CARD',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      const response = await getSale(created.id);
      expect(response.statusCode).toBe(200);
      const sale = JSON.parse(response.body) as SaleResponse;

      expect(sale.id).toBe(created.id);
      expect(sale.payments).toHaveLength(1);
      expect(sale.payments![0]).toMatchObject({ amount: '30.00', method: 'DEBIT_CARD' });
    });

    it('404 (nunca 403) para venda de outra empresa', async () => {
      const otherCompany = await prisma.company.create({
        data: { name: 'Outra Empresa', document: `doc-c-${Date.now()}` },
      });
      const otherUser = await prisma.user.create({
        data: {
          email: `outro-${Date.now()}@teste.com`,
          passwordHash: await passwordService.hashPassword(password),
          companyId: otherCompany.id,
        },
      });
      const permission = await prisma.permission.findFirstOrThrow({
        where: { resource: 'sales', action: 'read' },
      });
      const role = await prisma.role.create({
        data: { companyId: otherCompany.id, name: 'Admin', isSystem: true },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
      await prisma.userRole.create({ data: { userId: otherUser.id, roleId: role.id } });
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: otherUser.email, password },
      });
      const otherToken = (JSON.parse(login.body) as AuthResponseDto).accessToken;

      const item = await createItem(10);
      const sale = await createSaleOk({
        kind: 'CASH',
        paymentMethod: 'CASH',
        items: [{ itemId: item.id, quantity: 1 }],
      });

      const response = await getSale(sale.id, otherToken);
      expect(response.statusCode).toBe(404);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('VENDA_NAO_ENCONTRADA');
    });

    it('404 para id inexistente', async () => {
      const response = await getSale('00000000-0000-0000-0000-000000000000');
      expect(response.statusCode).toBe(404);
    });
  });
});
