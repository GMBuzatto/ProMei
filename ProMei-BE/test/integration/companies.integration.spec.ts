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

/** `POST /companies` provisiona: devolve a empresa e os ids do que foi criado. */
interface ProvisionResponse {
  company: CompanyResponse;
  adminUserId: string;
  adminRoleId: string;
  collaboratorRoleId: string;
}

interface CompanyResponse {
  id: string;
  name: string;
  document: string;
  segment: string;
  status: string;
}

// Mesmo padrão de auth.integration.spec.ts: container Postgres efêmero via testcontainers.
const CONTAINER_TIMEOUT_MS = 120_000;

describe('Companies Integration Tests - RF-20 (CRUD de empresas)', () => {
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
    await prisma.userRole.deleteMany({});
    await prisma.rolePermission.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.company.deleteMany({});
    await prisma.permission.deleteMany({});

    // O provisionamento concede permissões a partir deste catálogo. Em produção
    // ele vem do seed; aqui precisa existir pelo mesmo motivo — sem ele os
    // papéis nasceriam vazios, e o service agora recusa esse cenário.
    await prisma.permission.createMany({
      data: [
        { resource: 'users', action: 'create' },
        { resource: 'users', action: 'read' },
        { resource: 'roles', action: 'read' },
        { resource: 'items', action: 'create' },
        { resource: 'items', action: 'read' },
        { resource: 'stock-movements', action: 'create' },
        { resource: 'stock-movements', action: 'read' },
        { resource: 'receipts', action: 'read' },
        { resource: 'audit-logs', action: 'read' },
        // De plataforma: entra no catálogo para o teste provar que o Admin da
        // empresa NÃO a recebe (RN-01/RN-05).
        { resource: 'companies', action: 'create' },
      ],
    });

    // O Super Admin precisa existir de verdade: a trilha de auditoria (RNF-06)
    // grava `user_id` com FK para `users`. Token com `sub` inventado passava
    // enquanto ninguém auditava estas rotas, mas não representa requisição real.
    // Usuário de plataforma não tem empresa (RN-05), então isso não afeta as
    // contagens de empresa esperadas nos testes de listagem.
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

  async function createCompany(overrides: Partial<Record<string, unknown>> = {}) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: authHeader(superAdminToken),
      payload: {
        name: 'Empresa Teste',
        document: `doc_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        segment: 'RETAIL',
        // Provisionamento exige o admin inicial: empresa sem ele nasceria
        // inacessivel, que era exatamente o estado que a rota permitia antes.
        adminEmail: `admin-${Date.now()}-${Math.floor(Math.random() * 100000)}@teste.com`,
        adminPassword: 'SenhaValida123!',
        ...overrides,
      },
    });
    return response;
  }

  describe('POST /companies (RF-20, RN-10)', () => {
    it('creates a company as Super Admin with default status ACTIVE', async () => {
      const response = await createCompany();

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload) as ProvisionResponse;
      expect(body.company.status).toBe('ACTIVE');
      expect(body.company.segment).toBe('RETAIL');
    });

    it('provisiona os papéis Admin e Colaborador junto com a empresa (RF-11)', async () => {
      const created = await createCompany();
      const body = JSON.parse(created.payload) as ProvisionResponse;

      const roles = await prisma.role.findMany({ where: { companyId: body.company.id } });

      expect(roles.map((role) => role.name).sort()).toEqual(['Admin', 'Colaborador']);
      expect(roles.every((role) => role.isSystem)).toBe(true);
    });

    it('o admin criado consegue logar — é isso que torna a empresa utilizável', async () => {
      const adminEmail = `admin-login-${Date.now()}@teste.com`;
      await createCompany({ adminEmail });

      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: adminEmail, password: 'SenhaValida123!' },
      });

      expect(login.statusCode).toBe(200);
    });

    it('o admin nasce obrigado a trocar a senha (RF-04)', async () => {
      const created = await createCompany();
      const body = JSON.parse(created.payload) as ProvisionResponse;

      const admin = await prisma.user.findUnique({ where: { id: body.adminUserId } });

      expect(admin?.mustChangePassword).toBe(true);
    });

    it('o admin recebe as permissões do papel, não só o vínculo', async () => {
      const created = await createCompany();
      const body = JSON.parse(created.payload) as ProvisionResponse;

      const grants = await prisma.rolePermission.findMany({
        where: { roleId: body.adminRoleId },
        include: { permission: true },
      });

      expect(grants.length).toBeGreaterThan(0);
      // O Admin administra a própria empresa, não a plataforma (RN-01/RN-05).
      expect(grants.some((grant) => grant.permission.resource === 'companies')).toBe(false);
      expect(grants.some((grant) => grant.permission.resource === 'items')).toBe(true);
    });

    it('recusa e-mail de admin já cadastrado sem criar a empresa', async () => {
      const adminEmail = `dup-${Date.now()}@teste.com`;
      await createCompany({ adminEmail });

      const before = await prisma.company.count();
      const response = await createCompany({ adminEmail });

      expect(response.statusCode).toBe(409);
      expect(await prisma.company.count()).toBe(before);
    });

    it('recusa criação sem o admin inicial — não existe meia-empresa', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/companies',
        headers: authHeader(superAdminToken),
        payload: { name: 'Sem Admin', document: `doc_${Date.now()}`, segment: 'RETAIL' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects creation without an access token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/companies',
        payload: {
          name: 'X',
          document: 'doc1',
          segment: 'RETAIL',
          adminEmail: 'x@teste.com',
          adminPassword: 'SenhaValida123!',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects creation for a role other than Super Admin/Staff (RN-10)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/companies',
        headers: authHeader(unauthorizedToken),
        payload: {
          name: 'X',
          document: 'doc1',
          segment: 'RETAIL',
          adminEmail: 'x@teste.com',
          adminPassword: 'SenhaValida123!',
        },
      });

      // 404 e nao 403: usuario de empresa em rota de plataforma nao deve nem
      // descobrir que o recurso existe (fronteira do PermissionsGuard).
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.code).toBe('RECURSO_NAO_ENCONTRADO');
    });

    it('rejects an invalid segment value', async () => {
      const response = await createCompany({ segment: 'NOT_A_SEGMENT' });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /companies', () => {
    it('lists companies with pagination', async () => {
      await createCompany({ name: 'A' });
      await createCompany({ name: 'B' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/companies?page=1&limit=1',
        headers: authHeader(superAdminToken),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as { data: CompanyResponse[]; total: number };
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(2);
    });
  });

  describe('GET /companies/:id', () => {
    it('returns 404 for an unknown company', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/companies/00000000-0000-0000-0000-000000000000',
        headers: authHeader(superAdminToken),
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload) as ErrorResponse;
      expect(body.code).toBe('RECURSO_NAO_ENCONTRADO');
    });
  });

  describe('PATCH /companies/:id (edição)', () => {
    it('updates name and segment without touching status', async () => {
      const created = await createCompany();
      const { company } = JSON.parse(created.payload) as ProvisionResponse;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/companies/${company.id}`,
        headers: authHeader(superAdminToken),
        payload: { name: 'Novo Nome', segment: 'HEALTH' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as CompanyResponse;
      expect(body.name).toBe('Novo Nome');
      expect(body.segment).toBe('HEALTH');
      expect(body.status).toBe('ACTIVE');
    });
  });

  describe('PATCH /companies/:id/status (RN-11 — transições de estado)', () => {
    async function expectTransition(
      companyId: string,
      status: string,
    ): Promise<{ statusCode: number; body: CompanyResponse | ErrorResponse }> {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/companies/${companyId}/status`,
        headers: authHeader(superAdminToken),
        payload: { status },
      });
      return {
        statusCode: response.statusCode,
        body: JSON.parse(response.payload) as CompanyResponse | ErrorResponse,
      };
    }

    it('allows ACTIVE -> SUSPENDED -> ACTIVE', async () => {
      const created = await createCompany();
      const { company } = JSON.parse(created.payload) as ProvisionResponse;

      const suspended = await expectTransition(company.id, 'SUSPENDED');
      expect(suspended.statusCode).toBe(200);
      expect((suspended.body as CompanyResponse).status).toBe('SUSPENDED');

      const reactivated = await expectTransition(company.id, 'ACTIVE');
      expect(reactivated.statusCode).toBe(200);
      expect((reactivated.body as CompanyResponse).status).toBe('ACTIVE');
    });

    it('allows ACTIVE -> CANCELED (terminal)', async () => {
      const created = await createCompany();
      const { company } = JSON.parse(created.payload) as ProvisionResponse;

      const canceled = await expectTransition(company.id, 'CANCELED');
      expect(canceled.statusCode).toBe(200);
      expect((canceled.body as CompanyResponse).status).toBe('CANCELED');
    });

    it('rejects SUSPENDED -> CANCELED (não existe em RN-11)', async () => {
      const created = await createCompany();
      const { company } = JSON.parse(created.payload) as ProvisionResponse;

      await expectTransition(company.id, 'SUSPENDED');
      const result = await expectTransition(company.id, 'CANCELED');

      expect(result.statusCode).toBe(422);
      expect((result.body as ErrorResponse).code).toBe('TRANSICAO_INVALIDA');
    });

    it('rejects any transition out of CANCELED (estado terminal)', async () => {
      const created = await createCompany();
      const { company } = JSON.parse(created.payload) as ProvisionResponse;

      await expectTransition(company.id, 'CANCELED');
      const result = await expectTransition(company.id, 'ACTIVE');

      expect(result.statusCode).toBe(422);
      expect((result.body as ErrorResponse).code).toBe('TRANSICAO_INVALIDA');
    });

    it('rejects a no-op transition (ACTIVE -> ACTIVE)', async () => {
      const created = await createCompany();
      const { company } = JSON.parse(created.payload) as ProvisionResponse;

      const result = await expectTransition(company.id, 'ACTIVE');

      expect(result.statusCode).toBe(422);
      expect((result.body as ErrorResponse).code).toBe('TRANSICAO_INVALIDA');
    });
  });
});
