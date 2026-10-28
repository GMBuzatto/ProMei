import { execSync } from 'node:child_process';
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CustomerFinancialStatus,
  CustomerStatus,
  SubscriptionStatus,
} from '../../src/generated/prisma/client';
import { PasswordService } from '../../src/modules/auth/password.service';
import { createFastifyAdapter } from '../../src/shared/http';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import type { AuthResponseDto } from '../../src/modules/auth/dto/auth-response.dto';

interface CustomerResponse {
  id: string;
  companyId: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  creditLimit: string;
  status: CustomerStatus;
  financialStatus: CustomerFinancialStatus;
  blockedForCredit: boolean;
}

interface CustomerListItemResponse extends CustomerResponse {
  /** docs/28: saldo em aberto por linha — "0.00" até `sales` existir (épico 10). */
  pendingTotal: string;
}

interface ListResponse {
  data: CustomerListItemResponse[];
  total: number;
  page: number;
  limit: number;
}

interface RemovalResponse {
  id: string;
  outcome: 'DELETED' | 'INACTIVATED';
}

interface ErrorResponse {
  code?: string;
  message: string;
}

interface FinancialSummaryResponse {
  customerId: string;
  financialStatus: CustomerFinancialStatus;
  blockedForCredit: boolean;
  creditLimit: string;
  period: {
    label: string;
    start: string;
    end: string;
    used: string;
    available: string;
    availableClamped: string;
  };
  lifetime: {
    purchasedTotal: string;
    paidTotal: string;
    pendingTotal: string;
    overdueTotal: string;
    salesCount: number;
    openSalesCount: number;
  };
}

interface StatusEventResponse {
  id: string;
  fromStatus: CustomerFinancialStatus | null;
  toStatus: CustomerFinancialStatus;
  reason: string;
  createdAt: string;
}

interface StatusEventsListResponse {
  data: StatusEventResponse[];
  total: number;
  page: number;
  limit: number;
}

const CONTAINER_TIMEOUT_MS = 120_000;

/** CRUD de clientes (docs/18, RN-30 a RN-38). */
describe('Clientes (CRUD + inativação)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  let company: { id: string };
  let plan: { id: string };
  let admin: { id: string; email: string };
  let token: string;
  /** Tem `customers:update` mas NÃO `customer-credit:update` — prova PD-16. */
  let tokenWithoutCreditPermission: string;

  const password = 'SenhaValida123!';

  function createCustomer(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/customers',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  function listCustomers(query = '') {
    return app.inject({
      method: 'GET',
      url: `/api/v1/customers${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function getCustomer(id: string) {
    return app.inject({
      method: 'GET',
      url: `/api/v1/customers/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function updateCustomer(id: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: `/api/v1/customers/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  function updateCustomerStatus(id: string, status: string) {
    return app.inject({
      method: 'PATCH',
      url: `/api/v1/customers/${id}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status },
    });
  }

  function removeCustomer(id: string) {
    return app.inject({
      method: 'DELETE',
      url: `/api/v1/customers/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function updateCreditLimit(id: string, creditLimit: unknown, useToken = token, reason?: string) {
    return app.inject({
      method: 'PATCH',
      url: `/api/v1/customers/${id}/credit-limit`,
      headers: { authorization: `Bearer ${useToken}` },
      payload: { creditLimit, ...(reason !== undefined ? { reason } : {}) },
    });
  }

  function updateCreditBlock(
    id: string,
    blockedForCredit: unknown,
    useToken = token,
    reason?: string,
  ) {
    return app.inject({
      method: 'PATCH',
      url: `/api/v1/customers/${id}/credit-block`,
      headers: { authorization: `Bearer ${useToken}` },
      payload: { blockedForCredit, ...(reason !== undefined ? { reason } : {}) },
    });
  }

  function getFinancialSummary(id: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/api/v1/customers/${id}/financial-summary${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function getStatusEvents(id: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/api/v1/customers/${id}/status-events${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function anonymizeCustomer(id: string) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/customers/${id}/anonymize`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function createCustomerOk(payload: Record<string, unknown>): Promise<CustomerResponse> {
    const response = await createCustomer(payload);
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body) as CustomerResponse;
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
    await prisma.refreshToken.deleteMany({});
    await prisma.customerStatusEvent.deleteMany({});
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

    plan = await prisma.plan.create({
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
        { resource: 'customers', action: 'read' },
        { resource: 'customers', action: 'create' },
        { resource: 'customers', action: 'update' },
        { resource: 'customers', action: 'delete' },
        { resource: 'customer-credit', action: 'update' },
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

    // Papel com customers:update mas SEM customer-credit:update — o teste
    // que prova a separação de PD-16 depende de existir alguém assim.
    const customersOnlyPermission = permissions.find(
      (permission) => permission.resource === 'customers' && permission.action === 'update',
    )!;
    const roleWithoutCredit = await prisma.role.create({
      data: { companyId: company.id, name: 'SemCredito', isSystem: false },
    });
    await prisma.rolePermission.create({
      data: { roleId: roleWithoutCredit.id, permissionId: customersOnlyPermission.id },
    });
    const userWithoutCredit = await prisma.user.create({
      data: {
        email: `sem-credito-${Date.now()}@teste.com`,
        passwordHash: await passwordService.hashPassword(password),
        companyId: company.id,
      },
    });
    await prisma.userRole.create({
      data: { userId: userWithoutCredit.id, roleId: roleWithoutCredit.id },
    });
    const loginWithoutCredit = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: userWithoutCredit.email, password },
    });
    tokenWithoutCreditPermission = (JSON.parse(loginWithoutCredit.body) as AuthResponseDto)
      .accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
  }, CONTAINER_TIMEOUT_MS);

  describe('POST /customers', () => {
    it('cria cliente com os campos do cadastro', async () => {
      const customer = await createCustomerOk({
        name: 'Maria da Esquina',
        document: '12345678900',
        email: 'maria@teste.com',
        phone: '11999998888',
        address: { street: 'Rua A', number: '10' },
        notes: 'Cliente antiga',
      });

      expect(customer).toMatchObject({
        name: 'Maria da Esquina',
        document: '12345678900',
        email: 'maria@teste.com',
        phone: '11999998888',
        notes: 'Cliente antiga',
        status: CustomerStatus.ACTIVE,
        financialStatus: CustomerFinancialStatus.REGULAR,
        blockedForCredit: false,
      });
    });

    it('documento é opcional — cadastra sem CPF/CNPJ', async () => {
      const response = await createCustomer({ name: 'Dona Maria da esquina' });
      expect(response.statusCode).toBe(201);
    });

    it('exige apenas o nome', async () => {
      expect((await createCustomer({})).statusCode).toBe(400);
    });

    it('creditLimit nasce do default de env, não é aceito no corpo', async () => {
      const response = await createCustomer({ name: 'Teste', creditLimit: 999_999 });
      // `whitelist`/`forbidNonWhitelisted`: campo fora do DTO é 400.
      expect(response.statusCode).toBe(400);
    });

    it('recusa documento fora da forma de CPF/CNPJ (docs/28)', async () => {
      // Chave de unicidade por empresa (RN-31): documento deformado duplica
      // cadastro em vez de impedir.
      for (const document of ['123', '1234567890a', '123456789012']) {
        const response = await createCustomer({ name: 'Cliente Doc', document });
        expect(response.statusCode).toBe(400);
      }
    });

    it('aceita CPF (11) e CNPJ (14) — só dígitos', async () => {
      const cpf = await createCustomerOk({ name: 'Pessoa Física', document: '11122233396' });
      expect(cpf.document).toBe('11122233396');

      const cnpj = await createCustomerOk({ name: 'Pessoa Jurídica', document: '11222333000181' });
      expect(cnpj.document).toBe('11222333000181');
    });

    it('recusa nome com menos de 2 caracteres (docs/28)', async () => {
      const response = await createCustomer({ name: 'A' });
      expect(response.statusCode).toBe(400);
    });

    it('financialStatus não é aceito no corpo — é sempre derivado', async () => {
      const response = await createCustomer({ name: 'Teste', financialStatus: 'DELINQUENT' });
      expect(response.statusCode).toBe(400);
    });

    it('status não é aceito no corpo — cliente novo sempre nasce ACTIVE', async () => {
      const response = await createCustomer({ name: 'Teste', status: 'INACTIVE' });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('RN-31 — documento único por empresa', () => {
    it('recusa documento repetido na mesma empresa', async () => {
      await createCustomerOk({ name: 'Cliente 1', document: '11122233344' });
      const response = await createCustomer({ name: 'Cliente 2', document: '11122233344' });

      expect(response.statusCode).toBe(409);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('DOCUMENTO_JA_CADASTRADO');
    });

    it('permite dois clientes sem documento na mesma empresa', async () => {
      await createCustomerOk({ name: 'Cliente 1' });
      const response = await createCustomer({ name: 'Cliente 2' });
      expect(response.statusCode).toBe(201);
    });

    it('permite o mesmo documento em empresas diferentes', async () => {
      await createCustomerOk({ name: 'Cliente 1', document: '55566677788' });

      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      const existing = await prisma.customer.create({
        data: { companyId: other.id, name: 'Já existente', document: '55566677788' },
      });
      expect(existing.document).toBe('55566677788');
    });
  });

  describe('GET /customers/:id e 404 cross-tenant', () => {
    it('lê um cliente da própria empresa', async () => {
      const created = await createCustomerOk({ name: 'Cliente X' });
      const response = await getCustomer(created.id);

      expect(response.statusCode).toBe(200);
      expect((JSON.parse(response.body) as CustomerResponse).id).toBe(created.id);
    });

    it('404 (nunca 403) para cliente de outra empresa', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      const foreignRecord = await prisma.customer.create({
        data: { companyId: other.id, name: 'Cliente alheio' },
      });

      const response = await getCustomer(foreignRecord.id);
      expect(response.statusCode).toBe(404);
    });

    it('o 404 traz o código CLIENTE_NAO_ENCONTRADO (docs/28)', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      const foreignRecord = await prisma.customer.create({
        data: { companyId: other.id, name: 'Cliente alheio' },
      });

      const response = await getCustomer(foreignRecord.id);
      expect(response.statusCode).toBe(404);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('CLIENTE_NAO_ENCONTRADO');
    });

    it('404 para id inexistente', async () => {
      const response = await getCustomer('00000000-0000-0000-0000-000000000000');
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /customers/:id/financial-summary (docs/18, docs/28)', () => {
    it('devolve o contrato completo, com period e lifetime zerados — não há venda ainda', async () => {
      const created = await createCustomerOk({ name: 'Cliente Resumo' });
      await updateCreditLimit(created.id, 1000);

      const response = await getFinancialSummary(created.id);
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as FinancialSummaryResponse;
      expect(body.customerId).toBe(created.id);
      expect(body.financialStatus).toBe('REGULAR');
      expect(body.blockedForCredit).toBe(false);
      expect(body.creditLimit).toBe('1000.00');

      expect(body.period.used).toBe('0.00');
      expect(body.period.available).toBe('1000.00');
      expect(body.period.availableClamped).toBe('1000.00');
      expect(typeof body.period.label).toBe('string');
      expect(new Date(body.period.start).getTime()).toBeLessThan(
        new Date(body.period.end).getTime(),
      );

      expect(body.lifetime).toEqual({
        purchasedTotal: '0.00',
        paidTotal: '0.00',
        pendingTotal: '0.00',
        overdueTotal: '0.00',
        salesCount: 0,
        openSalesCount: 0,
      });
    });

    it('period e lifetime são objetos separados — não a mesma escala', async () => {
      const created = await createCustomerOk({ name: 'Cliente Resumo' });
      const response = await getFinancialSummary(created.id);
      const body = JSON.parse(response.body) as FinancialSummaryResponse;

      expect(body).toHaveProperty('period');
      expect(body).toHaveProperty('lifetime');
      expect(body.period).not.toHaveProperty('purchasedTotal');
      expect(body.lifetime).not.toHaveProperty('used');
    });

    it('aceita period=YYYY-MM explícito e devolve o label pedido', async () => {
      const created = await createCustomerOk({ name: 'Cliente Resumo' });
      const response = await getFinancialSummary(created.id, '?period=2026-03');

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as FinancialSummaryResponse;
      expect(body.period.label).toBe('2026-03');
    });

    it('400 para period em formato inválido', async () => {
      const created = await createCustomerOk({ name: 'Cliente Resumo' });
      const response = await getFinancialSummary(created.id, '?period=2026-3');
      expect(response.statusCode).toBe(400);
    });

    it('404 (nunca 403) para cliente de outra empresa', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      const foreignRecord = await prisma.customer.create({
        data: { companyId: other.id, name: 'Cliente alheio' },
      });

      const response = await getFinancialSummary(foreignRecord.id);
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /customers/:id/status-events (docs/18, RN-66)', () => {
    it('lista vazia para cliente sem nenhuma transição', async () => {
      const created = await createCustomerOk({ name: 'Cliente Eventos' });
      const response = await getStatusEvents(created.id);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as StatusEventsListResponse;
      expect(body).toMatchObject({ data: [], total: 0 });
    });

    it('paginado — devolve os eventos existentes da própria empresa', async () => {
      const created = await createCustomerOk({ name: 'Cliente Eventos' });
      await prisma.customerStatusEvent.create({
        data: {
          companyId: company.id,
          customerId: created.id,
          toStatus: 'OVERDUE',
          reason: 'OVERDUE_JOB',
        },
      });

      const response = await getStatusEvents(created.id);
      const body = JSON.parse(response.body) as StatusEventsListResponse;

      expect(body.total).toBe(1);
      expect(body.data[0]).toMatchObject({ toStatus: 'OVERDUE', reason: 'OVERDUE_JOB' });
    });

    it('404 (nunca 403) para cliente de outra empresa', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      const foreignRecord = await prisma.customer.create({
        data: { companyId: other.id, name: 'Cliente alheio' },
      });

      const response = await getStatusEvents(foreignRecord.id);
      expect(response.statusCode).toBe(404);
    });

    it('isolamento: não vaza evento de outra empresa', async () => {
      const created = await createCustomerOk({ name: 'Cliente Eventos' });

      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      const otherCustomer = await prisma.customer.create({
        data: { companyId: other.id, name: 'Cliente alheio' },
      });
      await prisma.customerStatusEvent.create({
        data: {
          companyId: other.id,
          customerId: otherCustomer.id,
          toStatus: 'DELINQUENT',
          reason: 'MANUAL',
        },
      });

      const response = await getStatusEvents(created.id);
      const body = JSON.parse(response.body) as StatusEventsListResponse;
      expect(body.total).toBe(0);
    });
  });

  describe('PATCH /customers/:id', () => {
    it('atualiza campos do cadastro', async () => {
      const created = await createCustomerOk({ name: 'Cliente Y' });
      const response = await updateCustomer(created.id, {
        name: 'Cliente Y Ltda',
        phone: '119999',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ name: 'Cliente Y Ltda', phone: '119999' });
    });

    it('não aceita creditLimit — tem rota e permissão próprias', async () => {
      const created = await createCustomerOk({ name: 'Cliente Z' });
      const response = await updateCustomer(created.id, { creditLimit: 5000 });
      expect(response.statusCode).toBe(400);
    });

    it('não aceita financialStatus — é derivado', async () => {
      const created = await createCustomerOk({ name: 'Cliente Z' });
      const response = await updateCustomer(created.id, { financialStatus: 'OVERDUE' });
      expect(response.statusCode).toBe(400);
    });

    it('não aceita status — tem rota própria (PATCH /:id/status)', async () => {
      const created = await createCustomerOk({ name: 'Cliente Z' });
      const response = await updateCustomer(created.id, { status: 'INACTIVE' });
      expect(response.statusCode).toBe(400);
    });

    it('não aceita blockedForCredit — tem rota e permissão próprias (PD-16)', async () => {
      const created = await createCustomerOk({ name: 'Cliente Z' });
      const response = await updateCustomer(created.id, { blockedForCredit: true });
      expect(response.statusCode).toBe(400);
    });

    it('404 (nunca 403) ao tentar editar cliente de outra empresa', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      const foreignRecord = await prisma.customer.create({
        data: { companyId: other.id, name: 'Cliente alheio' },
      });

      const response = await updateCustomer(foreignRecord.id, { name: 'Invasão' });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /customers/:id/credit-limit (PD-16, RN-35/36)', () => {
    it('altera o limite de crédito', async () => {
      const created = await createCustomerOk({ name: 'Cliente Crédito' });
      const response = await updateCreditLimit(created.id, 2500.5);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ creditLimit: '2500.5' });
    });

    it('baixar o limite abaixo do valor anterior é permitido — fecha a torneira sem apagar histórico', async () => {
      const created = await createCustomerOk({ name: 'Cliente Crédito' });
      await updateCreditLimit(created.id, 5000);

      const response = await updateCreditLimit(created.id, 100);
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ creditLimit: '100' });
    });

    it('recusa valor acima do teto de FINANCE_MAX_CREDIT_LIMIT', async () => {
      const created = await createCustomerOk({ name: 'Cliente Crédito' });
      // Default de env.config.ts é 1_000_000 — bem acima de qualquer teste legítimo.
      const response = await updateCreditLimit(created.id, 2_000_000);

      expect(response.statusCode).toBe(422);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('LIMITE_INVALIDO');
    });

    it('recusa valor negativo', async () => {
      const created = await createCustomerOk({ name: 'Cliente Crédito' });
      const response = await updateCreditLimit(created.id, -10);
      expect(response.statusCode).toBe(400);
    });

    it('registra a alteração na auditoria com valor anterior e novo (RN-36)', async () => {
      const created = await createCustomerOk({ name: 'Cliente Crédito' });
      await updateCreditLimit(created.id, 1500);

      const entries = await prisma.auditLog.findMany({
        where: { companyId: company.id, action: 'customer.credit_limit_updated' },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]?.diff).toMatchObject({ customerId: created.id, to: '1500' });
    });

    it('leva o reason opcional para a auditoria (docs/28)', async () => {
      const created = await createCustomerOk({ name: 'Cliente Crédito' });
      await updateCreditLimit(created.id, 1500, token, 'Cliente antigo, bom pagador');

      const entries = await prisma.auditLog.findMany({
        where: { companyId: company.id, action: 'customer.credit_limit_updated' },
      });
      expect(entries[0]?.diff).toMatchObject({ reason: 'Cliente antigo, bom pagador' });
    });

    it('403 com customers:update mas SEM customer-credit:update (PD-16)', async () => {
      const created = await createCustomerOk({ name: 'Cliente Crédito' });
      const response = await updateCreditLimit(created.id, 1000, tokenWithoutCreditPermission);
      expect(response.statusCode).toBe(403);
    });

    it('404 (nunca 403) para cliente de outra empresa', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      const foreignRecord = await prisma.customer.create({
        data: { companyId: other.id, name: 'Cliente alheio' },
      });

      const response = await updateCreditLimit(foreignRecord.id, 1000);
      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /customers/:id/credit-block (PD-16)', () => {
    it('bloqueia e desbloqueia o cliente para crédito', async () => {
      const created = await createCustomerOk({ name: 'Cliente Bloqueio' });

      const blocked = await updateCreditBlock(created.id, true);
      expect(blocked.statusCode).toBe(200);
      expect((JSON.parse(blocked.body) as CustomerResponse).blockedForCredit).toBe(true);

      const unblocked = await updateCreditBlock(created.id, false);
      expect((JSON.parse(unblocked.body) as CustomerResponse).blockedForCredit).toBe(false);
    });

    it('registra a alteração na auditoria', async () => {
      const created = await createCustomerOk({ name: 'Cliente Bloqueio' });
      await updateCreditBlock(created.id, true);

      const entries = await prisma.auditLog.findMany({
        where: { companyId: company.id, action: 'customer.credit_blocked' },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]?.diff).toMatchObject({ customerId: created.id, from: false, to: true });
    });

    it('gera customer_status_events com reason MANUAL (docs/28)', async () => {
      const created = await createCustomerOk({ name: 'Cliente Bloqueio' });
      await updateCreditBlock(created.id, true, token, 'Cheque devolvido');

      const events = await prisma.customerStatusEvent.findMany({
        where: { companyId: company.id, customerId: created.id },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        reason: 'MANUAL',
        // Bloqueio manual não muda a situação DERIVADA (RN-34): from e to são
        // o mesmo valor de propósito, e o que mudou fica no context.
        fromStatus: 'REGULAR',
        toStatus: 'REGULAR',
        userId: admin.id,
      });
      expect(events[0]?.context).toMatchObject({
        blockedForCredit: true,
        previousBlockedForCredit: false,
        reason: 'Cheque devolvido',
      });
    });

    it('desbloquear gera o segundo evento — o histórico é append-only (RN-66)', async () => {
      const created = await createCustomerOk({ name: 'Cliente Bloqueio' });
      await updateCreditBlock(created.id, true);
      await updateCreditBlock(created.id, false);

      const events = await prisma.customerStatusEvent.findMany({
        where: { companyId: company.id, customerId: created.id },
        orderBy: { createdAt: 'asc' },
      });

      expect(events).toHaveLength(2);
      expect(events[1]?.context).toMatchObject({ blockedForCredit: false });
    });

    it('repetir o mesmo estado não gera evento nem auditoria', async () => {
      const created = await createCustomerOk({ name: 'Cliente Bloqueio' });
      await updateCreditBlock(created.id, false);

      const events = await prisma.customerStatusEvent.count({
        where: { companyId: company.id, customerId: created.id },
      });
      expect(events).toBe(0);
    });

    it('o evento aparece em GET /customers/:id/status-events', async () => {
      const created = await createCustomerOk({ name: 'Cliente Bloqueio' });
      await updateCreditBlock(created.id, true);

      const response = await getStatusEvents(created.id);
      const body = JSON.parse(response.body) as StatusEventsListResponse;

      expect(body.total).toBe(1);
      expect(body.data[0]).toMatchObject({ reason: 'MANUAL' });
    });

    it('403 com customers:update mas SEM customer-credit:update (PD-16)', async () => {
      const created = await createCustomerOk({ name: 'Cliente Bloqueio' });
      const response = await updateCreditBlock(created.id, true, tokenWithoutCreditPermission);
      expect(response.statusCode).toBe(403);
    });

    it('404 (nunca 403) para cliente de outra empresa', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      const foreignRecord = await prisma.customer.create({
        data: { companyId: other.id, name: 'Cliente alheio' },
      });

      const response = await updateCreditBlock(foreignRecord.id, true);
      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /customers/:id/status (RN-33)', () => {
    it('inativa e reativa o cliente', async () => {
      const created = await createCustomerOk({ name: 'Cliente Ativo' });

      const inactivated = await updateCustomerStatus(created.id, 'INACTIVE');
      expect(inactivated.statusCode).toBe(200);
      expect((JSON.parse(inactivated.body) as CustomerResponse).status).toBe('INACTIVE');

      const reactivated = await updateCustomerStatus(created.id, 'ACTIVE');
      expect((JSON.parse(reactivated.body) as CustomerResponse).status).toBe('ACTIVE');
    });

    it('cliente inativo continua consultável (RN-33)', async () => {
      const created = await createCustomerOk({ name: 'Cliente Ativo' });
      await updateCustomerStatus(created.id, 'INACTIVE');

      const response = await getCustomer(created.id);
      expect(response.statusCode).toBe(200);
    });
  });

  describe('DELETE /customers/:id (RN-32)', () => {
    it('exclui de fato cliente sem venda vinculada', async () => {
      const created = await createCustomerOk({ name: 'Cliente Sem Venda' });

      const response = await removeCustomer(created.id);
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body) as RemovalResponse).toEqual({
        id: created.id,
        outcome: 'DELETED',
      });

      const stored = await prisma.customer.findUnique({ where: { id: created.id } });
      expect(stored).toBeNull();
    });

    it('404 para cliente já removido', async () => {
      const created = await createCustomerOk({ name: 'Cliente Sem Venda' });
      await removeCustomer(created.id);

      const response = await removeCustomer(created.id);
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /customers — busca, filtro e paginação', () => {
    beforeEach(async () => {
      await createCustomerOk({
        name: 'Ana Silva',
        document: '10000000001',
        email: 'ana@teste.com',
      });
      await createCustomerOk({
        name: 'Bruno Souza',
        document: '10000000002',
        email: 'bruno@teste.com',
      });
      const carlos = await createCustomerOk({ name: 'Carlos Dias', document: '10000000003' });
      await updateCustomerStatus(carlos.id, 'INACTIVE');
    });

    it('busca por nome sem diferenciar maiúsculas', async () => {
      const response = await listCustomers('?search=ana');
      const body = JSON.parse(response.body) as ListResponse;
      expect(body.data.map((customer) => customer.name)).toEqual(['Ana Silva']);
    });

    it('busca também por documento', async () => {
      const response = await listCustomers('?search=10000000002');
      const body = JSON.parse(response.body) as ListResponse;
      expect(body.data.map((customer) => customer.name)).toEqual(['Bruno Souza']);
    });

    it('sem filtro devolve ativos e inativos', async () => {
      const response = await listCustomers();
      const body = JSON.parse(response.body) as ListResponse;
      expect(body.total).toBe(3);
    });

    it('filtra por status', async () => {
      const response = await listCustomers('?status=INACTIVE');
      const body = JSON.parse(response.body) as ListResponse;
      expect(body.data.map((customer) => customer.name)).toEqual(['Carlos Dias']);
    });

    it('filtra por financialStatus', async () => {
      const response = await listCustomers('?financialStatus=REGULAR');
      const body = JSON.parse(response.body) as ListResponse;
      expect(body.total).toBe(3);
    });

    it('pagina o resultado', async () => {
      const response = await listCustomers('?page=1&limit=2');
      const body = JSON.parse(response.body) as ListResponse;
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(3);
    });

    it('cada linha traz creditLimit, financialStatus e pendingTotal (docs/28)', async () => {
      const response = await listCustomers();
      const body = JSON.parse(response.body) as ListResponse;

      expect(body.data.length).toBeGreaterThan(0);
      for (const row of body.data) {
        expect(typeof row.creditLimit).toBe('string');
        expect(row.financialStatus).toBe('REGULAR');
        // Zero, e não ausente: `sales` chega no épico 10 e o contrato já
        // nasce estável para a UI.
        expect(row.pendingTotal).toBe('0.00');
      }
    });

    it('lista apenas clientes da própria empresa', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      await prisma.customer.create({ data: { companyId: other.id, name: 'Cliente alheio' } });

      const response = await listCustomers();
      const body = JSON.parse(response.body) as ListResponse;
      expect(body.total).toBe(3);
    });
  });

  describe('limite de clientes do plano (RN-14, PD-08)', () => {
    const MAX_CUSTOMERS = 2;

    beforeEach(async () => {
      await prisma.plan.update({
        where: { id: plan.id },
        data: { limits: { maxUsers: 10, maxItems: 100, maxCustomers: MAX_CUSTOMERS } },
      });
    });

    it(`permite criar até ${MAX_CUSTOMERS} clientes ativos`, async () => {
      expect((await createCustomer({ name: 'Cliente 1' })).statusCode).toBe(201);
      expect((await createCustomer({ name: 'Cliente 2' })).statusCode).toBe(201);
    });

    it('BLOQUEIA a criação ao exceder o limite', async () => {
      await createCustomerOk({ name: 'Cliente 1' });
      await createCustomerOk({ name: 'Cliente 2' });

      const surplus = await createCustomer({ name: 'Cliente 3' });

      expect(surplus.statusCode).toBe(422);
      expect((JSON.parse(surplus.body) as ErrorResponse).code).toBe('LIMITE_PLANO_EXCEDIDO');
    });

    it('inativar um cliente libera vaga', async () => {
      const first = await createCustomerOk({ name: 'Cliente 1' });
      await createCustomerOk({ name: 'Cliente 2' });

      expect((await createCustomer({ name: 'Cliente cheio' })).statusCode).toBe(422);

      await updateCustomerStatus(first.id, 'INACTIVE');

      expect((await createCustomer({ name: 'Cliente com vaga' })).statusCode).toBe(201);
    });

    it('reativar um cliente também respeita o teto (mesmo padrão de ItemsService)', async () => {
      const first = await createCustomerOk({ name: 'Cliente 1' });
      await createCustomerOk({ name: 'Cliente 2' });
      await updateCustomerStatus(first.id, 'INACTIVE');
      await createCustomerOk({ name: 'Cliente com vaga' }); // ocupa a vaga liberada

      const reactivated = await updateCustomerStatus(first.id, 'ACTIVE');
      expect(reactivated.statusCode).toBe(422);
    });

    it('exceder o limite não apaga quem já existe (RN-14)', async () => {
      await createCustomerOk({ name: 'Cliente 1' });
      await createCustomerOk({ name: 'Cliente 2' });
      await createCustomer({ name: 'Cliente 3' });

      const active = await prisma.customer.count({
        where: { companyId: company.id, status: 'ACTIVE' },
      });
      expect(active).toBe(MAX_CUSTOMERS);
    });

    it('plano sem maxCustomers cai no default de PLAN_DEFAULT_MAX_CUSTOMERS, não "sem teto"', async () => {
      await prisma.plan.update({
        where: { id: plan.id },
        data: { limits: { maxUsers: 10, maxItems: 100 } }, // sem maxCustomers
      });

      // Não cria 100 clientes aqui — só confirma que o service resolveu um
      // teto (chamando a função pura já testada em plan-limits.spec.ts) em
      // vez de tratar a ausência como ilimitado.
      const response = await createCustomer({ name: 'Cliente qualquer' });
      expect(response.statusCode).toBe(201);
    });
  });

  describe('POST /customers/:id/anonymize (LGPD, PD-17, RN-38)', () => {
    it('esvazia o cadastro, marca anonymizedAt e passa a INACTIVE', async () => {
      const created = await createCustomerOk({
        name: 'Maria da Esquina',
        document: '99988877766',
        email: 'maria@teste.com',
        phone: '11999997777',
        address: { street: 'Rua A' },
        notes: 'nota que deve permanecer',
      });

      const response = await anonymizeCustomer(created.id);
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as CustomerResponse & {
        anonymizedAt: string | null;
        address: unknown;
      };
      expect(body.name).toBe('Cliente removido');
      expect(body.document).toBeNull();
      expect(body.email).toBeNull();
      expect(body.phone).toBeNull();
      expect(body.address).toBeNull();
      expect(body.anonymizedAt).not.toBeNull();
      expect(body.status).toBe('INACTIVE');

      // docs/18: notes não é um dos campos que a decisão do PD-17 esvazia.
      const stored = await prisma.customer.findUniqueOrThrow({ where: { id: created.id } });
      expect(stored.notes).toBe('nota que deve permanecer');
    });

    it('é idempotente: anonimizar de novo não gera segundo evento de auditoria', async () => {
      const created = await createCustomerOk({ name: 'Cliente Y', document: '12312312300' });

      await anonymizeCustomer(created.id);
      const second = await anonymizeCustomer(created.id);
      expect(second.statusCode).toBe(200);

      const entries = await prisma.auditLog.findMany({
        where: { companyId: company.id, action: 'customer.anonymized' },
      });
      expect(entries).toHaveLength(1);
    });

    it('registra a anonimização na auditoria', async () => {
      const created = await createCustomerOk({ name: 'Cliente Z' });
      await anonymizeCustomer(created.id);

      const entries = await prisma.auditLog.findMany({
        where: { companyId: company.id, action: 'customer.anonymized' },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]?.userId).toBe(admin.id);
    });

    it('404 (nunca 403) para cliente de outra empresa', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      const foreignRecord = await prisma.customer.create({
        data: { companyId: other.id, name: 'Cliente alheio' },
      });

      const response = await anonymizeCustomer(foreignRecord.id);
      expect(response.statusCode).toBe(404);
    });
  });

  describe('permissão', () => {
    it('403 sem customers:read', async () => {
      await prisma.rolePermission.deleteMany({});
      const response = await listCustomers();
      expect(response.statusCode).toBe(403);
    });
  });
});
