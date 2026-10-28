import { execSync } from 'node:child_process';
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SubscriptionStatus } from '../../src/generated/prisma/client';
import { JwtService } from '../../src/modules/auth/jwt.service';
import { PasswordService } from '../../src/modules/auth/password.service';
import { createFastifyAdapter } from '../../src/shared/http';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import type { AuthResponseDto } from '../../src/modules/auth/dto/auth-response.dto';

interface FinanceSettingsResponse {
  companyId: string;
  closingDay: number;
  timezone: string;
  delinquencyDays: number;
  defaultDueDays: number;
  createdAt: string;
  updatedAt: string;
  currentPeriod?: { label: string; start: string; end: string };
  nextPeriod?: { label: string; start: string; end: string };
}

interface ErrorResponse {
  code?: string;
  message: string;
}

const CONTAINER_TIMEOUT_MS = 120_000;

/** GET/PUT /companies/me/finance-settings (docs/20, docs/27, RN-52 a RN-55). */
describe('Configuração financeira (GET/PUT companies/me/finance-settings)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let jwtService: JwtService;

  let companyA: { id: string };
  let companyB: { id: string };
  let tokenA: string;
  let tokenB: string;
  let tokenNoPermission: string;
  let superAdminToken: string;

  const password = 'SenhaValida123!';

  function authHeader(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  function getSettings(token: string) {
    return app.inject({
      method: 'GET',
      url: '/api/v1/companies/me/finance-settings',
      headers: authHeader(token),
    });
  }

  function putSettings(token: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'PUT',
      url: '/api/v1/companies/me/finance-settings',
      headers: authHeader(token),
      payload,
    });
  }

  function putAdminPassword(token: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'PUT',
      url: '/api/v1/companies/me/finance-settings/admin-password',
      headers: authHeader(token),
      payload,
    });
  }

  async function createTenant(closingDay: number) {
    const company = await prisma.company.create({
      data: { name: `Empresa ${closingDay}`, document: `doc-${closingDay}-${Date.now()}` },
    });

    const plan = await prisma.plan.create({
      data: {
        name: `Starter ${closingDay}-${Date.now()}`,
        price: 49.9,
        period: 'monthly',
        limits: {},
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

    await prisma.companyFinanceSettings.create({
      data: {
        companyId: company.id,
        closingDay,
        timezone: 'America/Sao_Paulo',
        delinquencyDays: 30,
        defaultDueDays: 30,
      },
    });

    // As permissões são globais (não por empresa): o segundo tenant criado
    // neste `beforeEach` bateria em `skipDuplicates` e `createManyAndReturn`
    // devolveria só as recém-inseridas — vazio para a segunda empresa. Por
    // isso `createMany` (ignora duplicata) seguido de `findMany` (sempre
    // pega as linhas de verdade, criadas agora ou por um tenant anterior).
    await prisma.permission.createMany({
      data: [
        { resource: 'finance-settings', action: 'read' },
        { resource: 'finance-settings', action: 'update' },
      ],
      skipDuplicates: true,
    });
    const permissions = await prisma.permission.findMany({
      where: { resource: 'finance-settings', action: { in: ['read', 'update'] } },
    });

    const adminRole = await prisma.role.create({
      data: { companyId: company.id, name: `Admin-${closingDay}`, isSystem: true },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: adminRole.id,
        permissionId: permission.id,
      })),
    });

    const admin = await prisma.user.create({
      data: {
        email: `admin-${closingDay}-${Date.now()}@teste.com`,
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
    const token = (JSON.parse(login.body) as AuthResponseDto).accessToken;

    return { company, token };
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
    jwtService = moduleRef.get<JwtService>(JwtService);
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.userRole.deleteMany({});
    await prisma.rolePermission.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.role.deleteMany({});
    await prisma.companyFinanceSettings.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.company.deleteMany({});
    await prisma.plan.deleteMany({});
    await prisma.permission.deleteMany({});

    const tenantA = await createTenant(15);
    const tenantB = await createTenant(20);
    companyA = tenantA.company;
    companyB = tenantB.company;
    tokenA = tenantA.token;
    tokenB = tenantB.token;

    // Mesma empresa A, mas o papel não tem finance-settings:* nenhuma.
    const noPermRole = await prisma.role.create({
      data: { companyId: companyA.id, name: 'SemPermissao', isSystem: false },
    });
    const noPermUser = await prisma.user.create({
      data: {
        email: `sem-permissao-${Date.now()}@teste.com`,
        passwordHash: await passwordService.hashPassword(password),
        companyId: companyA.id,
      },
    });
    await prisma.userRole.create({ data: { userId: noPermUser.id, roleId: noPermRole.id } });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: noPermUser.email, password },
    });
    tokenNoPermission = (JSON.parse(login.body) as AuthResponseDto).accessToken;

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
  });

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
  }, CONTAINER_TIMEOUT_MS);

  describe('GET /companies/me/finance-settings', () => {
    it('devolve a configuração da PRÓPRIA empresa, resolvida pelo JWT', async () => {
      const response = await getSettings(tokenA);
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as FinanceSettingsResponse;
      expect(body.companyId).toBe(companyA.id);
      expect(body.closingDay).toBe(15);
      expect(body.timezone).toBe('America/Sao_Paulo');
      expect(body.delinquencyDays).toBe(30);
      expect(body.defaultDueDays).toBe(30);
    });

    it('nunca devolve admin_password_hash (nem em qualquer grafia)', async () => {
      const response = await getSettings(tokenA);
      const body = JSON.parse(response.body) as Record<string, unknown>;

      expect(body).not.toHaveProperty('adminPasswordHash');
      expect(body).not.toHaveProperty('admin_password_hash');
      expect(body).not.toHaveProperty('adminPasswordFailedAttempts');
    });

    it('isolamento: empresa B recebe a PRÓPRIA configuração, não a de A', async () => {
      const response = await getSettings(tokenB);
      const body = JSON.parse(response.body) as FinanceSettingsResponse;

      expect(body.companyId).toBe(companyB.id);
      expect(body.closingDay).toBe(20);
    });

    it('403 sem a permissão finance-settings:read', async () => {
      const response = await getSettings(tokenNoPermission);
      expect(response.statusCode).toBe(403);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('PERMISSAO_NEGADA');
    });

    it('404 para usuário de plataforma — rota é de tenant (RN-05)', async () => {
      const response = await getSettings(superAdminToken);
      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /companies/me/finance-settings', () => {
    // Deliberadamente diferente do closingDay de B (20): o teste de
    // isolamento abaixo depende de A e B nascerem com valores distintos.
    const validPayload = {
      closingDay: 10,
      timezone: 'America/Sao_Paulo',
      delinquencyDays: 45,
      defaultDueDays: 15,
    };

    it('altera closingDay, timezone, delinquencyDays e defaultDueDays', async () => {
      const response = await putSettings(tokenA, validPayload);
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as FinanceSettingsResponse;
      expect(body.closingDay).toBe(10);
      expect(body.timezone).toBe('America/Sao_Paulo');
      expect(body.delinquencyDays).toBe(45);
      expect(body.defaultDueDays).toBe(15);

      const persisted = await prisma.companyFinanceSettings.findUnique({
        where: { companyId: companyA.id },
      });
      expect(persisted?.closingDay).toBe(10);
    });

    it('a resposta diz explicitamente qual é a próxima janela (RN-54)', async () => {
      const response = await putSettings(tokenA, validPayload);
      const body = JSON.parse(response.body) as FinanceSettingsResponse;

      expect(body.currentPeriod).toBeDefined();
      expect(body.nextPeriod).toBeDefined();

      const current = body.currentPeriod!;
      const next = body.nextPeriod!;

      expect(new Date(current.start).getTime()).toBeLessThan(new Date(current.end).getTime());
      expect(new Date(next.start).getTime()).toBeLessThan(new Date(next.end).getTime());

      // `nextPeriod` é o período, JÁ sob a configuração NOVA, que está em
      // vigor no instante em que o período atual (ainda sob a configuração
      // ANTERIOR) termina — por isso contém esse instante, e não
      // necessariamente começa exatamente nele: o grid do fechamento novo não
      // precisa alinhar com o grid antigo (closingDay mudou de 15 para 10).
      const currentEnd = new Date(current.end).getTime();
      expect(new Date(next.start).getTime()).toBeLessThanOrEqual(currentEnd);
      expect(new Date(next.end).getTime()).toBeGreaterThan(currentEnd);
    });

    it('nunca aceita admin_password_hash — campo fora do DTO é 400', async () => {
      const response = await putSettings(tokenA, {
        ...validPayload,
        adminPasswordHash: 'tentativa-de-injecao',
      });
      expect(response.statusCode).toBe(400);

      const persisted = await prisma.companyFinanceSettings.findUnique({
        where: { companyId: companyA.id },
      });
      expect(persisted?.adminPasswordHash).toBeNull();
    });

    it('recusa timezone que não é um fuso IANA válido', async () => {
      const response = await putSettings(tokenA, { ...validPayload, timezone: 'Not/AZone' });
      expect(response.statusCode).toBe(400);
    });

    it.each([0, 32])('recusa closingDay fora de 1..31: %i', async (closingDay) => {
      const response = await putSettings(tokenA, { ...validPayload, closingDay });
      expect(response.statusCode).toBe(400);
    });

    it('403 sem a permissão finance-settings:update', async () => {
      const response = await putSettings(tokenNoPermission, validPayload);
      expect(response.statusCode).toBe(403);
    });

    it('registra a alteração na auditoria (RNF-06)', async () => {
      await putSettings(tokenA, validPayload);

      const entries = await prisma.auditLog.findMany({
        where: { companyId: companyA.id, action: 'finance-settings.updated' },
      });
      expect(entries).toHaveLength(1);
    });

    it('isolamento: alterar a empresa A não toca a empresa B', async () => {
      await putSettings(tokenA, validPayload);

      const untouched = await prisma.companyFinanceSettings.findUnique({
        where: { companyId: companyB.id },
      });
      // Valor original de B (20), não o que acabou de ser gravado em A (10).
      expect(untouched?.closingDay).toBe(20);
      expect(untouched?.delinquencyDays).toBe(30);
    });
  });

  describe('PUT /companies/me/finance-settings/admin-password (docs/20, docs/24, PD-13)', () => {
    it('define a senha administrativa exigindo a senha de LOGIN de quem chama', async () => {
      const response = await putAdminPassword(tokenA, {
        currentPassword: password,
        newAdminPassword: 'SenhaAdminForte123!',
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      const settings = await prisma.companyFinanceSettings.findUnique({
        where: { companyId: companyA.id },
      });
      expect(settings?.adminPasswordHash).not.toBeNull();
      expect(settings?.adminPasswordUpdatedAt).not.toBeNull();
    });

    it('nunca devolve o hash — a resposta é 204 sem corpo', async () => {
      const response = await putAdminPassword(tokenA, {
        currentPassword: password,
        newAdminPassword: 'SenhaAdminForte123!',
      });
      expect(response.body).not.toContain('adminPasswordHash');
    });

    it('401 quando currentPassword é a senha administrativa antiga, não a de login', async () => {
      // Simula alguém tentando usar a senha administrativa (que não é a de
      // login) para confirmar a troca — deve falhar exatamente como qualquer
      // outra senha errada, sem nenhum tratamento especial.
      const response = await putAdminPassword(tokenA, {
        currentPassword: 'senha-administrativa-antiga',
        newAdminPassword: 'SenhaAdminForte123!',
      });

      expect(response.statusCode).toBe(401);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('SENHA_ATUAL_INCORRETA');

      const settings = await prisma.companyFinanceSettings.findUnique({
        where: { companyId: companyA.id },
      });
      expect(settings?.adminPasswordHash).toBeNull();
    });

    it('400 quando a nova senha administrativa é curta demais — não é "só um PIN"', async () => {
      const response = await putAdminPassword(tokenA, {
        currentPassword: password,
        newAdminPassword: '123',
      });
      expect(response.statusCode).toBe(400);
    });

    it('redefinir zera o lockout — os contadores eram da senha ANTERIOR', async () => {
      await prisma.companyFinanceSettings.update({
        where: { companyId: companyA.id },
        data: {
          adminPasswordHash: 'hash-de-uma-senha-anterior',
          adminPasswordFailedAttempts: 4,
          adminPasswordLockedUntil: new Date(Date.now() + 60_000),
        },
      });

      const response = await putAdminPassword(tokenA, {
        currentPassword: password,
        newAdminPassword: 'SenhaAdminForte123!',
      });
      expect(response.statusCode).toBe(204);

      const settings = await prisma.companyFinanceSettings.findUnique({
        where: { companyId: companyA.id },
      });
      expect(settings?.adminPasswordFailedAttempts).toBe(0);
      expect(settings?.adminPasswordLockedUntil).toBeNull();
      expect(settings?.adminPasswordHash).not.toBe('hash-de-uma-senha-anterior');
    });

    it('403 sem a permissão finance-settings:update', async () => {
      const response = await putAdminPassword(tokenNoPermission, {
        currentPassword: password,
        newAdminPassword: 'SenhaAdminForte123!',
      });
      expect(response.statusCode).toBe(403);
    });

    it('registra sucesso e falha na auditoria, sem nunca logar a senha', async () => {
      await putAdminPassword(tokenA, {
        currentPassword: 'errada',
        newAdminPassword: 'x'.repeat(20),
      });
      await putAdminPassword(tokenA, {
        currentPassword: password,
        newAdminPassword: 'SenhaAdminForte123!',
      });

      const entries = await prisma.auditLog.findMany({
        where: {
          companyId: companyA.id,
          action: { startsWith: 'finance-settings.admin_password_set' },
        },
        orderBy: { createdAt: 'asc' },
      });

      expect(entries.map((entry) => entry.action)).toEqual([
        'finance-settings.admin_password_set_failed',
        'finance-settings.admin_password_set',
      ]);
      expect(JSON.stringify(entries)).not.toContain('SenhaAdminForte123!');
      expect(JSON.stringify(entries)).not.toContain('errada');
    });

    it('isolamento: definir a senha da empresa A não toca a empresa B', async () => {
      await putAdminPassword(tokenA, {
        currentPassword: password,
        newAdminPassword: 'SenhaAdminForte123!',
      });

      const untouched = await prisma.companyFinanceSettings.findUnique({
        where: { companyId: companyB.id },
      });
      expect(untouched?.adminPasswordHash).toBeNull();
    });
  });
});
