import { execSync } from 'node:child_process';
import { ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFastifyAdapter } from '../../src/shared/http';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PasswordService } from '../../src/modules/auth/password.service';
import type { AuthResponseDto } from '../../src/modules/auth/dto/auth-response.dto';

interface ErrorResponse {
  code?: string;
  message: string;
}

const CONTAINER_TIMEOUT_MS = 120_000;

/**
 * RF-03 (bloqueio progressivo) e RF-04 (troca e reset de senha).
 * Mesmo padrão do auth.integration.spec: Postgres efêmero via testcontainers.
 */
describe('Auth Integration - RF-03 (bloqueio) e RF-04 (senha)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  let company: { id: string };
  let adminRole: { id: string };
  let memberRole: { id: string };
  let user: { id: string; email: string };
  let admin: { id: string; email: string };

  const userPassword = 'ValidPassword123!';
  const adminPassword = 'AdminPassword123!';
  const newPassword = 'BrandNewPassword456!';

  async function login(email: string, password: string): Promise<AuthResponseDto> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    return JSON.parse(response.body) as AuthResponseDto;
  }

  async function failLogin(email: string, times: number): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: 'WrongPassword123!' },
      });
    }
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
    // Durações curtas para o teste não depender de espera real.
    process.env.AUTH_LOCKOUT_DURATION_MS = '1000';
    process.env.AUTH_LOCKOUT_MAX_DURATION_MS = '4000';

    execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit' });

    const { AppModule } = await import('../../src/app.module.js');

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Mesma configuracao de producao (inclui o genReqId do correlation id).
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
    await prisma.company.deleteMany({});

    company = await prisma.company.create({
      data: { name: 'Empresa Teste', document: `doc_${Date.now()}` },
    });

    adminRole = await prisma.role.create({ data: { name: 'ADMIN', companyId: company.id } });

    // reset-password exige a permissao `users:update` (RF-13). O papel ADMIN
    // precisa te-la vinculada, como acontece no seed real.
    const usersUpdatePermission = await prisma.permission.upsert({
      where: { resource_action: { resource: 'users', action: 'update' } },
      update: {},
      create: { resource: 'users', action: 'update' },
    });
    await prisma.rolePermission.create({
      data: { roleId: adminRole.id, permissionId: usersUpdatePermission.id },
    });
    memberRole = await prisma.role.create({
      data: { name: 'COLABORADOR', companyId: company.id },
    });

    user = await prisma.user.create({
      data: {
        email: `user_${Date.now()}@test.com`,
        passwordHash: await passwordService.hashPassword(userPassword),
        companyId: company.id,
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: memberRole.id } });

    admin = await prisma.user.create({
      data: {
        email: `admin_${Date.now()}@test.com`,
        passwordHash: await passwordService.hashPassword(adminPassword),
        companyId: company.id,
      },
    });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
  }, CONTAINER_TIMEOUT_MS);

  describe('RF-03 — bloqueio temporário', () => {
    it('bloqueia na 6ª tentativa após 5 falhas (critério de aceite)', async () => {
      await failLogin(user.email, 5);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: user.email, password: userPassword },
      });

      expect(response.statusCode).toBe(401);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('CONTA_BLOQUEADA');
    });

    it('bloqueia mesmo com a senha correta enquanto o prazo não expira', async () => {
      await failLogin(user.email, 5);

      const record = await prisma.user.findUnique({ where: { id: user.id } });
      expect(record?.lockedUntil).not.toBeNull();
      expect(record?.lockoutCount).toBe(1);
    });

    it('libera o acesso depois que o bloqueio expira', async () => {
      await failLogin(user.email, 5);

      // Simula a passagem do tempo em vez de esperar de fato.
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: user.email, password: userPassword },
      });

      expect(response.statusCode).toBe(200);
    });

    it('aplica bloqueio progressivo: o segundo dura o dobro do primeiro', async () => {
      await failLogin(user.email, 5);
      const first = await prisma.user.findUnique({ where: { id: user.id } });
      const firstDuration = (first?.lockedUntil?.getTime() ?? 0) - Date.now();

      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() - 1000), failedLoginAttempts: 0 },
      });

      await failLogin(user.email, 5);
      const second = await prisma.user.findUnique({ where: { id: user.id } });
      const secondDuration = (second?.lockedUntil?.getTime() ?? 0) - Date.now();

      expect(second?.lockoutCount).toBe(2);
      expect(secondDuration).toBeGreaterThan(firstDuration);
    });

    it('zera o histórico de bloqueios após um login bem-sucedido', async () => {
      await failLogin(user.email, 5);
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });

      await login(user.email, userPassword);

      const record = await prisma.user.findUnique({ where: { id: user.id } });
      expect(record?.lockoutCount).toBe(0);
      expect(record?.failedLoginAttempts).toBe(0);
      expect(record?.lockedUntil).toBeNull();
    });
  });

  describe('RF-04 — troca de senha pelo usuário', () => {
    it('troca a senha quando a senha atual está correta', async () => {
      const { accessToken } = await login(user.email, userPassword);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { currentPassword: userPassword, newPassword },
      });

      expect(response.statusCode).toBe(204);

      const newLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: user.email, password: newPassword },
      });
      expect(newLogin.statusCode).toBe(200);
    });

    it('recusa a troca quando a senha atual está errada', async () => {
      const { accessToken } = await login(user.email, userPassword);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { currentPassword: 'SenhaErrada123!', newPassword },
      });

      expect(response.statusCode).toBe(401);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('SENHA_ATUAL_INCORRETA');
    });

    it('exige autenticação', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        payload: { currentPassword: userPassword, newPassword },
      });

      expect(response.statusCode).toBe(401);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('NAO_AUTENTICADO');
    });

    it('revoga as sessões antigas após a troca', async () => {
      const { accessToken, refreshToken } = await login(user.email, userPassword);

      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { currentPassword: userPassword, newPassword },
      });

      const refresh = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      });

      expect(refresh.statusCode).toBe(401);
    });
  });

  describe('RF-04 — reset por admin', () => {
    const passwordSetByAdmin = 'TempPassword789!';

    async function resetAsAdmin(): Promise<void> {
      const { accessToken } = await login(admin.email, adminPassword);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { userId: user.id, newPassword: passwordSetByAdmin },
      });

      expect(response.statusCode).toBe(204);
    }

    it('admin define a senha e marca troca obrigatória', async () => {
      await resetAsAdmin();

      const record = await prisma.user.findUnique({ where: { id: user.id } });
      expect(record?.mustChangePassword).toBe(true);
    });

    it('usuário consegue logar com a senha definida pelo admin', async () => {
      await resetAsAdmin();

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: user.email, password: passwordSetByAdmin },
      });

      expect(response.statusCode).toBe(200);
    });

    it('bloqueia o uso da API até a troca obrigatória ser feita', async () => {
      await resetAsAdmin();
      const { accessToken } = await login(user.email, passwordSetByAdmin);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { userId: user.id, newPassword: 'OutraSenha123456!' },
      });

      expect(response.statusCode).toBe(403);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('TROCA_DE_SENHA_OBRIGATORIA');
    });

    it('permite trocar a senha mesmo com a troca pendente, e libera a API', async () => {
      await resetAsAdmin();
      const firstAccess = await login(user.email, passwordSetByAdmin);

      const swap = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        headers: { authorization: `Bearer ${firstAccess.accessToken}` },
        payload: { currentPassword: passwordSetByAdmin, newPassword },
      });

      expect(swap.statusCode).toBe(204);

      const record = await prisma.user.findUnique({ where: { id: user.id } });
      expect(record?.mustChangePassword).toBe(false);
    });

    it('nega reset para quem não tem a permissão users:update (RF-13)', async () => {
      const { accessToken } = await login(user.email, userPassword);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { userId: admin.id, newPassword: 'QualquerSenha123!' },
      });

      expect(response.statusCode).toBe(403);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('PERMISSAO_NEGADA');
    });

    it('libera bloqueio por tentativas ao resetar a senha', async () => {
      await failLogin(user.email, 5);
      await resetAsAdmin();

      const record = await prisma.user.findUnique({ where: { id: user.id } });
      expect(record?.lockedUntil).toBeNull();
      expect(record?.failedLoginAttempts).toBe(0);
      expect(record?.lockoutCount).toBe(0);
    });

    it('registra o reset na trilha de auditoria', async () => {
      await resetAsAdmin();

      const records = await prisma.auditLog.findMany({
        where: { action: 'password.reset_by_admin' },
      });

      expect(records).toHaveLength(1);
      expect(records[0]?.userId).toBe(admin.id);
    });
  });
});
