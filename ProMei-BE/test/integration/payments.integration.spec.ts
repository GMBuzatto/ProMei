import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SaleStatus, SubscriptionStatus } from '../../src/generated/prisma/client';
import { PasswordService } from '../../src/modules/auth/password.service';
import { createFastifyAdapter } from '../../src/shared/http';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import type { AuthResponseDto } from '../../src/modules/auth/dto/auth-response.dto';

interface ErrorResponse {
  code?: string;
  message: string;
}

interface SaleResponse {
  id: string;
  status: string;
  total: string;
  paidAmount: string;
  balance: string;
  customer: { id: string; name: string } | null;
}

interface PaymentResponse {
  id: string;
  saleId: string;
  amount: string;
  method: string;
  paidAt: string;
  notes: string | null;
  createdAt: string;
  sale: { id: string; status: string; paidAmount: string; balance: string };
  customer: { id: string; financialStatus: string } | null;
}

interface PaymentReversalResponse {
  outcome: string;
  payment: {
    id: string;
    saleId: string;
    amount: string;
    reversedAt: string;
    reversedBy: string;
    reversalReason: string;
  };
  sale: { id: string; status: string; paidAmount: string; balance: string };
  customer: { id: string; financialStatus: string } | null;
}

const CONTAINER_TIMEOUT_MS = 120_000;
const PASSWORD = 'SenhaValida123!';

describe('Recebimentos (POST /payments)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let storageDir: string;

  let company: { id: string };
  let admin: { id: string; email: string };
  let token: string;

  function createSale(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/sales',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function createSaleOk(payload: Record<string, unknown>): Promise<SaleResponse> {
    const response = await createSale(payload);
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body) as SaleResponse;
  }

  function createPayment(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/payments',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function createPaymentOk(payload: Record<string, unknown>): Promise<PaymentResponse> {
    const response = await createPayment(payload);
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body) as PaymentResponse;
  }

  function reversePayment(paymentId: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentId}/reversal`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function reversePaymentOk(
    paymentId: string,
    payload: Record<string, unknown>,
  ): Promise<PaymentReversalResponse> {
    const response = await reversePayment(paymentId, payload);
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body) as PaymentReversalResponse;
  }

  async function createItem(stock = 10, price = 100) {
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

  async function createCustomer(overrides: Record<string, unknown> = {}) {
    return prisma.customer.create({
      data: { companyId: company.id, name: 'Cliente Teste', creditLimit: 100_000, ...overrides },
    });
  }

  /** Cria uma venda a prazo real via API — payments precisa de uma venda de verdade. */
  async function createCreditSale(
    customerId: string,
    total: number,
    dueDate = '2027-01-15',
  ): Promise<SaleResponse> {
    const item = await createItem(1000, total);
    return createSaleOk({
      kind: 'CREDIT',
      customerId,
      dueDate,
      items: [{ itemId: item.id, quantity: 1 }],
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

    storageDir = await mkdtemp(join(tmpdir(), 'promei-payments-it-'));
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
    await prisma.customerStatusEvent.deleteMany({});
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
        { resource: 'payments', action: 'create' },
        { resource: 'payments', action: 'delete' },
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
        passwordHash: await passwordService.hashPassword(PASSWORD),
        companyId: company.id,
      },
    });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: admin.email, password: PASSWORD },
    });
    token = (JSON.parse(login.body) as AuthResponseDto).accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  }, CONTAINER_TIMEOUT_MS);

  describe('recebimento parcial e quitação (RN-70, RN-73)', () => {
    it('recebimento parcial: PARTIALLY_PAID, saldo correto', async () => {
      const customer = await createCustomer();
      const sale = await createCreditSale(customer.id, 100);

      const payment = await createPaymentOk({ saleId: sale.id, amount: 40, method: 'PIX' });

      expect(payment.sale).toMatchObject({
        status: 'PARTIALLY_PAID',
        paidAmount: '40.00',
        balance: '60.00',
      });
      expect(payment.amount).toBe('40.00');

      const refreshed = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
      expect(refreshed.status).toBe(SaleStatus.PARTIALLY_PAID);
      expect(refreshed.paidAmount.toString()).toBe('40');
    });

    it('dois recebimentos parciais quitam a venda: PAID, cliente regularizado, limite utilizado NÃO muda (RN-51)', async () => {
      const customer = await createCustomer({ creditLimit: 1000 });
      const sale = await createCreditSale(customer.id, 100);

      await createPaymentOk({ saleId: sale.id, amount: 60, method: 'PIX' });
      const second = await createPaymentOk({ saleId: sale.id, amount: 40, method: 'CASH' });

      expect(second.sale).toMatchObject({ status: 'PAID', paidAmount: '100.00', balance: '0.00' });

      // RN-51: pagar uma venda a prazo NÃO devolve limite — utilizado no
      // período continua sendo a soma dos totais das vendas a prazo, não
      // o saldo devedor.
      const anotherSale = await createSale({
        kind: 'CREDIT',
        customerId: customer.id,
        dueDate: '2027-01-15',
        items: [{ itemId: (await createItem(10, 950)).id, quantity: 1 }],
      });
      // 100 (já paga) + 950 = 1050 > 1000 — se o limite tivesse sido
      // devolvido pelo pagamento, isso passaria.
      expect(anotherSale.statusCode).toBe(422);
    });

    it('quitação parcial de título VENCIDO não regulariza (docs/21, RN-73)', async () => {
      const customer = await createCustomer();
      const sale = await createCreditSale(customer.id, 100);
      // dueDate no passado é recusado na CRIAÇÃO da venda (10.7); para
      // simular um título já vencido, ajusta due_date direto no banco,
      // como um fato histórico legítimo (venda criada quando ainda não
      // vencia, e o tempo passou).
      await prisma.sale.update({
        where: { id: sale.id },
        data: { dueDate: new Date(Date.now() - 10 * 86_400_000) },
      });

      const payment = await createPaymentOk({ saleId: sale.id, amount: 40, method: 'PIX' });

      expect(payment.sale.status).toBe('OVERDUE');

      const customerAfter = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
      expect(customerAfter.financialStatus).toBe('OVERDUE');

      // Quitação TOTAL agora regulariza.
      const final = await createPaymentOk({ saleId: sale.id, amount: 60, method: 'PIX' });
      expect(final.sale.status).toBe('PAID');
      expect(final.customer).toMatchObject({ financialStatus: 'REGULAR' });
    });
  });

  describe('recusas (RN-71, RN-72)', () => {
    it('pagamento de R$ 0,01 acima do saldo é recusado e nada é gravado', async () => {
      const customer = await createCustomer();
      const sale = await createCreditSale(customer.id, 100);

      const response = await createPayment({ saleId: sale.id, amount: 100.01, method: 'PIX' });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body) as ErrorResponse;
      expect(body.code).toBe('PAGAMENTO_EXCEDE_SALDO');

      expect(await prisma.payment.count({ where: { saleId: sale.id } })).toBe(0);
      const refreshed = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
      expect(refreshed.paidAmount.toString()).toBe('0');
    });

    it('pagamento em venda cancelada é recusado (VENDA_CANCELADA)', async () => {
      const customer = await createCustomer();
      const sale = await createCreditSale(customer.id, 100);
      await prisma.sale.update({
        where: { id: sale.id },
        data: {
          status: SaleStatus.CANCELED,
          canceledAt: new Date(),
          canceledBy: admin.id,
          cancelReason: 'teste',
        },
      });

      const response = await createPayment({ saleId: sale.id, amount: 10, method: 'PIX' });

      expect(response.statusCode).toBe(422);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('VENDA_CANCELADA');
      expect(await prisma.payment.count({ where: { saleId: sale.id } })).toBe(0);
    });

    it('venda inexistente ou de outra empresa: 404 VENDA_NAO_ENCONTRADA', async () => {
      const response = await createPayment({
        saleId: '00000000-0000-0000-0000-000000000000',
        amount: 10,
        method: 'PIX',
      });

      expect(response.statusCode).toBe(404);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('VENDA_NAO_ENCONTRADA');
    });

    it('paidAt no futuro é 400 VALIDACAO_FALHOU', async () => {
      const customer = await createCustomer();
      const sale = await createCreditSale(customer.id, 100);

      const response = await createPayment({
        saleId: sale.id,
        amount: 10,
        method: 'PIX',
        paidAt: '2030-01-01',
      });

      expect(response.statusCode).toBe(400);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('VALIDACAO_FALHOU');
    });

    it('amount zero ou negativo é 400 (forma, não política)', async () => {
      const customer = await createCustomer();
      const sale = await createCreditSale(customer.id, 100);

      expect((await createPayment({ saleId: sale.id, amount: 0, method: 'PIX' })).statusCode).toBe(
        400,
      );
      expect(
        (await createPayment({ saleId: sale.id, amount: -10, method: 'PIX' })).statusCode,
      ).toBe(400);
    });
  });

  describe('concorrência — dois recebimentos simultâneos (docs/22#concorrência, docs/30)', () => {
    it('dois recebimentos simultâneos do saldo total: um passa, outro PAGAMENTO_EXCEDE_SALDO', async () => {
      const customer = await createCustomer();
      const sale = await createCreditSale(customer.id, 100);

      const payload = { saleId: sale.id, amount: 100, method: 'PIX' };
      const [first, second] = await Promise.all([createPayment(payload), createPayment(payload)]);

      expect([first.statusCode, second.statusCode].sort((a, b) => a - b)).toEqual([201, 422]);

      const refreshed = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
      expect(refreshed.paidAmount.toString()).toBe('100');
      expect(refreshed.status).toBe(SaleStatus.PAID);
      expect(await prisma.payment.count({ where: { saleId: sale.id } })).toBe(1);
    });
  });

  describe('paid_at vs created_at (docs/22)', () => {
    it('paidAt informado (retroativo) é preservado; createdAt é o registro agora', async () => {
      const customer = await createCustomer();
      const sale = await createCreditSale(customer.id, 100);
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();

      const payment = await createPaymentOk({
        saleId: sale.id,
        amount: 50,
        method: 'PIX',
        paidAt: yesterday,
      });

      expect(new Date(payment.paidAt).toISOString().slice(0, 10)).toBe(yesterday.slice(0, 10));
      expect(new Date(payment.createdAt).getTime()).toBeGreaterThan(
        new Date(payment.paidAt).getTime(),
      );
    });
  });

  describe('estorno (POST /payments/:id/reversal, RN-74, RN-76, PD-15)', () => {
    it('estorna um recebimento parcial: devolve o saldo, não apaga nem edita a linha', async () => {
      const customer = await createCustomer();
      const sale = await createCreditSale(customer.id, 100);
      const payment = await createPaymentOk({ saleId: sale.id, amount: 40, method: 'PIX' });

      const reversal = await reversePaymentOk(payment.id, { reason: 'lançamento em duplicidade' });

      expect(reversal.outcome).toBe('REVERSED');
      expect(reversal.payment).toMatchObject({
        id: payment.id,
        amount: '40.00',
        reversalReason: 'lançamento em duplicidade',
      });
      expect(reversal.sale).toMatchObject({
        status: 'PENDING',
        paidAmount: '0.00',
        balance: '100.00',
      });

      // RN-74: não apaga nem edita — a linha continua existindo, só marcada.
      const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(stored.amount.toString()).toBe('40');
      expect(stored.reversedAt).not.toBeNull();
      expect(stored.reversedBy).toBe(admin.id);
      expect(stored.reversalReason).toBe('lançamento em duplicidade');

      const refreshedSale = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
      expect(refreshedSale.paidAmount.toString()).toBe('0');
      expect(refreshedSale.status).toBe(SaleStatus.PENDING);
    });

    it('estorno de quitação total de título vencido REINADIMPLE o cliente e gera customer_status_events (RN-76)', async () => {
      const customer = await createCustomer();
      const sale = await createCreditSale(customer.id, 100);
      const payment = await createPaymentOk({ saleId: sale.id, amount: 100, method: 'PIX' });
      expect(payment.sale.status).toBe('PAID');

      // Título vencia no futuro na criação; o tempo passou.
      await prisma.sale.update({
        where: { id: sale.id },
        data: { dueDate: new Date(Date.now() - 10 * 86_400_000) },
      });

      const reversal = await reversePaymentOk(payment.id, {
        reason: 'pagamento não confirmado pelo banco',
      });

      expect(reversal.sale.status).toBe('OVERDUE');
      expect(reversal.customer).toMatchObject({ financialStatus: 'OVERDUE' });

      const events = await prisma.customerStatusEvent.findMany({
        where: { customerId: customer.id, reason: 'PAYMENT_REVERSAL' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ toStatus: 'OVERDUE', paymentId: payment.id });
    });

    it('recebimento já estornado não é estornável de novo (422 PAGAMENTO_JA_ESTORNADO)', async () => {
      const customer = await createCustomer();
      const sale = await createCreditSale(customer.id, 100);
      const payment = await createPaymentOk({ saleId: sale.id, amount: 40, method: 'PIX' });

      await reversePaymentOk(payment.id, { reason: 'primeiro estorno' });
      const second = await reversePayment(payment.id, { reason: 'segunda tentativa' });

      expect(second.statusCode).toBe(422);
      expect((JSON.parse(second.body) as ErrorResponse).code).toBe('PAGAMENTO_JA_ESTORNADO');

      const refreshedSale = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
      expect(refreshedSale.paidAmount.toString()).toBe('0');
    });

    it('recebimento inexistente ou de outra empresa: 404 PAGAMENTO_NAO_ENCONTRADO', async () => {
      const response = await reversePayment('00000000-0000-0000-0000-000000000000', {
        reason: 'qualquer motivo',
      });

      expect(response.statusCode).toBe(404);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('PAGAMENTO_NAO_ENCONTRADO');
    });

    it('motivo é obrigatório (400)', async () => {
      const customer = await createCustomer();
      const sale = await createCreditSale(customer.id, 100);
      const payment = await createPaymentOk({ saleId: sale.id, amount: 40, method: 'PIX' });

      expect((await reversePayment(payment.id, {})).statusCode).toBe(400);
      expect((await reversePayment(payment.id, { reason: '' })).statusCode).toBe(400);
    });

    it('dois estornos simultâneos do mesmo recebimento: um passa, outro PAGAMENTO_JA_ESTORNADO', async () => {
      const customer = await createCustomer();
      const sale = await createCreditSale(customer.id, 100);
      const payment = await createPaymentOk({ saleId: sale.id, amount: 40, method: 'PIX' });

      const payload = { reason: 'estorno concorrente' };
      const [first, second] = await Promise.all([
        reversePayment(payment.id, payload),
        reversePayment(payment.id, payload),
      ]);

      expect([first.statusCode, second.statusCode].sort((a, b) => a - b)).toEqual([201, 422]);

      const refreshedSale = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
      expect(refreshedSale.paidAmount.toString()).toBe('0');
    });
  });
});
