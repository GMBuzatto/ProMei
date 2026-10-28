import { execSync } from 'node:child_process';
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CompanyStatus, SubscriptionStatus, UserStatus } from '../../src/generated/prisma/client';
import { createFastifyAdapter } from '../../src/shared/http';
import { PasswordService } from '../../src/modules/auth/password.service';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import type { AuthResponseDto } from '../../src/modules/auth/dto/auth-response.dto';

interface ErrorResponse {
  code?: string;
  message: string;
}

const CONTAINER_TIMEOUT_MS = 120_000;

/**
 * Tabela de decisão de acesso (docs/04) — critério de aceite do épico BE-4.
 *
 * Cada linha da tabela vira um cenário de ponta a ponta: login, leitura e
 * escrita reais contra a API, com empresa e assinatura em cada combinação.
 */
describe('Tabela de decisão de acesso (BE-4)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  let company: { id: string };
  let plan: { id: string };
  let adminRole: { id: string };
  let adminUser: { id: string; email: string };

  const password = 'SenhaValida123!';

  async function attemptLogin(email: string) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
  }

  async function loginAndGetToken(email: string): Promise<string> {
    const response = await attemptLogin(email);
    return (JSON.parse(response.body) as AuthResponseDto).accessToken;
  }

  async function setStates(
    companyStatus: CompanyStatus,
    subscriptionStatus: SubscriptionStatus | null,
  ): Promise<void> {
    await prisma.company.update({ where: { id: company.id }, data: { status: companyStatus } });

    if (subscriptionStatus === null) {
      await prisma.subscription.deleteMany({ where: { companyId: company.id } });
      return;
    }

    await prisma.subscription.upsert({
      where: { companyId: company.id },
      update: { status: subscriptionStatus },
      create: {
        companyId: company.id,
        planId: plan.id,
        status: subscriptionStatus,
        renewsAt: new Date('2027-01-01'),
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
    await prisma.userRole.deleteMany({});
    await prisma.rolePermission.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.company.deleteMany({});
    await prisma.plan.deleteMany({});
    await prisma.permission.deleteMany({});

    company = await prisma.company.create({
      data: { name: 'Empresa Teste', document: `doc-${Date.now()}` },
    });

    plan = await prisma.plan.create({
      data: {
        name: `Plano ${Date.now()}`,
        price: 49.9,
        period: 'monthly',
        limits: { maxUsers: 5, maxItems: 100 },
      },
    });

    const permissions = await prisma.permission.createManyAndReturn({
      data: [
        { resource: 'users', action: 'read' },
        { resource: 'users', action: 'create' },
        { resource: 'roles', action: 'read' },
      ],
    });

    adminRole = await prisma.role.create({
      data: { companyId: company.id, name: 'Admin', isSystem: true },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission: { id: string }) => ({
        roleId: adminRole.id,
        permissionId: permission.id,
      })),
    });

    adminUser = await prisma.user.create({
      data: {
        email: `user-${Date.now()}@teste.com`,
        passwordHash: await passwordService.hashPassword(password),
        companyId: company.id,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
  }, CONTAINER_TIMEOUT_MS);

  describe('empresa ativa + assinatura ativa: acesso total', () => {
    it('permite login, leitura e escrita', async () => {
      await setStates(CompanyStatus.ACTIVE, SubscriptionStatus.ACTIVE);
      const token = await loginAndGetToken(adminUser.email);

      const read = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${token}` },
      });
      const write = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${token}` },
        payload: { email: `novo-${Date.now()}@teste.com`, password: 'OutraSenhaValida123!' },
      });

      expect(read.statusCode).toBe(200);
      expect(write.statusCode).toBe(201);
    });

    it('assinatura em trial também tem acesso total', async () => {
      await setStates(CompanyStatus.ACTIVE, SubscriptionStatus.TRIAL);
      const token = await loginAndGetToken(adminUser.email);

      const write = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${token}` },
        payload: { email: `trial-${Date.now()}@teste.com`, password: 'OutraSenhaValida123!' },
      });

      expect(write.statusCode).toBe(201);
    });
  });

  describe('empresa ativa + inadimplente: leitura sim, escrita não (RN-13)', () => {
    it('permite login', async () => {
      await setStates(CompanyStatus.ACTIVE, SubscriptionStatus.PAST_DUE);

      expect((await attemptLogin(adminUser.email)).statusCode).toBe(200);
    });

    it('permite leitura', async () => {
      await setStates(CompanyStatus.ACTIVE, SubscriptionStatus.PAST_DUE);
      const token = await loginAndGetToken(adminUser.email);

      const read = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(read.statusCode).toBe(200);
    });

    it('BLOQUEIA escrita com código de negócio', async () => {
      await setStates(CompanyStatus.ACTIVE, SubscriptionStatus.PAST_DUE);
      const token = await loginAndGetToken(adminUser.email);

      const write = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${token}` },
        payload: { email: `bloqueado-${Date.now()}@teste.com`, password: 'OutraSenhaValida123!' },
      });

      expect(write.statusCode).toBe(403);
      expect((JSON.parse(write.body) as ErrorResponse).code).toBe('ACESSO_SOMENTE_LEITURA');
    });
  });

  describe('empresa suspensa: bloqueio total', () => {
    it('nega login mesmo com senha correta', async () => {
      await setStates(CompanyStatus.SUSPENDED, SubscriptionStatus.ACTIVE);

      const response = await attemptLogin(adminUser.email);

      expect(response.statusCode).toBe(403);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('EMPRESA_SEM_ACESSO');
    });

    it('token emitido antes da suspensão para de funcionar', async () => {
      await setStates(CompanyStatus.ACTIVE, SubscriptionStatus.ACTIVE);
      const token = await loginAndGetToken(adminUser.email);

      await setStates(CompanyStatus.SUSPENDED, SubscriptionStatus.ACTIVE);

      const read = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(read.statusCode).toBe(403);
      expect((JSON.parse(read.body) as ErrorResponse).code).toBe('EMPRESA_SEM_ACESSO');
    });
  });

  describe('empresa cancelada: bloqueio total', () => {
    it('nega login', async () => {
      await setStates(CompanyStatus.CANCELED, SubscriptionStatus.ACTIVE);

      expect((await attemptLogin(adminUser.email)).statusCode).toBe(403);
    });
  });

  describe('registro em auditoria', () => {
    it('login bloqueado por empresa suspensa é auditado', async () => {
      await setStates(CompanyStatus.SUSPENDED, SubscriptionStatus.ACTIVE);
      await attemptLogin(adminUser.email);

      const records = await prisma.auditLog.findMany({ where: { action: 'login.blocked' } });

      expect(records).toHaveLength(1);
      expect(records[0]?.diff).toMatchObject({ reason: 'COMPANY_SUSPENDED' });
    });
  });
});
