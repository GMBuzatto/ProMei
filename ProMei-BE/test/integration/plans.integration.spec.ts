import { execSync } from 'node:child_process';
import { ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, it, beforeAll, beforeEach, afterAll, expect } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createFastifyAdapter } from '../../src/shared/http';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { JwtService } from '../../src/modules/auth/jwt.service';

interface ErrorResponse {
  code?: string;
  message: string;
}

interface PlanResponse {
  id: string;
  name: string;
  price: string;
  period: string;
  limits: { maxUsers: number; maxItems: number };
}

// Mesmo padrão de auth.integration.spec.ts: container Postgres efêmero via testcontainers.
const CONTAINER_TIMEOUT_MS = 120_000;

describe('Plans Integration Tests - RF-21 (CRUD de planos)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let superAdminToken: string;
  let unauthorizedToken: string;

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
    jwtService = moduleRef.get<JwtService>(JwtService);
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.company.deleteMany({});
    await prisma.plan.deleteMany({});

    // Ver companies.integration.spec.ts: a trilha de auditoria (RNF-06) grava
    // `user_id` com FK para `users`, então o autor precisa existir de fato.
    const superAdmin = await prisma.user.create({
      data: {
        email: `super-admin-${Date.now()}@promei.test`,
        passwordHash: 'nao-usado-neste-teste',
        companyId: null,
      },
    });

    superAdminToken = jwtService.generateAccessToken({
      sub: superAdmin.id,
      company_id: null,
      roles: ['Super Admin'],
    });

    // Sintético de propósito: o PermissionsGuard barra antes do service, então
    // nenhuma linha de auditoria é escrita por este token.
    unauthorizedToken = jwtService.generateAccessToken({
      sub: 'collaborator-id',
      company_id: 'some-company-id',
      roles: ['Colaborador'],
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (container) {
      await container.stop();
    }
  }, CONTAINER_TIMEOUT_MS);

  function authHeader(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  async function createPlan(overrides: Partial<Record<string, unknown>> = {}) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/plans',
      headers: authHeader(superAdminToken),
      payload: {
        name: `Plano ${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        price: 99.9,
        period: 'monthly',
        limits: { maxUsers: 5, maxItems: 200 },
        ...overrides,
      },
    });
  }

  describe('POST /plans (RF-21)', () => {
    it('creates a plan with valid limits shape', async () => {
      const response = await createPlan();

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload) as PlanResponse;
      expect(body.limits).toEqual({ maxUsers: 5, maxItems: 200 });
      expect(body.period).toBe('monthly');
    });

    it('rejects creation without an access token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/plans',
        payload: { name: 'X', price: 1, period: 'monthly', limits: { maxUsers: 1, maxItems: 1 } },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects creation for a role other than Super Admin/Staff', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/plans',
        headers: authHeader(unauthorizedToken),
        payload: { name: 'X', price: 1, period: 'monthly', limits: { maxUsers: 1, maxItems: 1 } },
      });

      // 404 e nao 403: usuario de empresa em rota de plataforma nao deve nem
      // descobrir que o recurso existe (fronteira do PermissionsGuard).
      expect(response.statusCode).toBe(404);
    });

    it('rejects an invalid period (only monthly/yearly allowed)', async () => {
      const response = await createPlan({ period: 'weekly' });
      expect(response.statusCode).toBe(400);
    });

    it('rejects limits missing maxItems (RN-14 shape validation)', async () => {
      const response = await createPlan({ limits: { maxUsers: 5 } });
      expect(response.statusCode).toBe(400);
    });

    it('rejects a non-positive limit value', async () => {
      const response = await createPlan({ limits: { maxUsers: 0, maxItems: 10 } });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /plans', () => {
    it('lists plans with pagination', async () => {
      await createPlan();
      await createPlan();

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/plans?page=1&limit=1',
        headers: authHeader(superAdminToken),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as { data: PlanResponse[]; total: number };
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(2);
    });
  });

  describe('GET /plans/:id', () => {
    it('returns 404 for an unknown plan', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/plans/00000000-0000-0000-0000-000000000000',
        headers: authHeader(superAdminToken),
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.code).toBe('RECURSO_NAO_ENCONTRADO');
    });
  });

  describe('PATCH /plans/:id', () => {
    it('updates the limits of an existing plan', async () => {
      const created = await createPlan();
      const plan = JSON.parse(created.payload) as PlanResponse;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/plans/${plan.id}`,
        headers: authHeader(superAdminToken),
        payload: { limits: { maxUsers: 10, maxItems: 500 } },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as PlanResponse;
      expect(body.limits).toEqual({ maxUsers: 10, maxItems: 500 });
    });
  });

  describe('DELETE /plans/:id', () => {
    it('deletes a plan with no subscriptions attached', async () => {
      const created = await createPlan();
      const plan = JSON.parse(created.payload) as PlanResponse;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/plans/${plan.id}`,
        headers: authHeader(superAdminToken),
      });

      expect(response.statusCode).toBe(204);
    });

    it('blocks deletion of a plan in use without deleting existing data (RN-14 spirit)', async () => {
      const created = await createPlan();
      const plan = JSON.parse(created.payload) as PlanResponse;

      const company = await prisma.company.create({
        data: { name: 'Empresa X', document: `doc_${Date.now()}`, segment: 'RETAIL' },
      });
      await prisma.subscription.create({
        data: { companyId: company.id, planId: plan.id, renewsAt: new Date() },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/plans/${plan.id}`,
        headers: authHeader(superAdminToken),
      });

      expect(response.statusCode).toBe(409);

      const stillExists = await prisma.plan.findUnique({ where: { id: plan.id } });
      expect(stillExists).not.toBeNull();
    });
  });
});
