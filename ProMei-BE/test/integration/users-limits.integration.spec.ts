import { execSync } from 'node:child_process';
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SubscriptionStatus, UserStatus } from '../../src/generated/prisma/client';
import { createFastifyAdapter } from '../../src/shared/http';
import { PasswordService } from '../../src/modules/auth/password.service';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import type { AuthResponseDto } from '../../src/modules/auth/dto/auth-response.dto';

interface ErrorResponse {
  code?: string;
  message: string;
}

const CONTAINER_TIMEOUT_MS = 120_000;
const MAX_USERS = 3;

/** CRUD de usuários com limite de plano (RN-02, RN-14). */
describe('Usuários da empresa e limites do plano (BE-4)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  let company: { id: string };
  let adminRole: { id: string };
  let admin: { id: string; email: string };
  let token: string;

  const password = 'SenhaValida123!';

  async function createUserViaApi(email: string) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${token}` },
      payload: { email, password: 'OutraSenhaValida123!' },
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

    const plan = await prisma.plan.create({
      data: {
        name: `Starter ${Date.now()}`,
        price: 49.9,
        period: 'monthly',
        limits: { maxUsers: MAX_USERS, maxItems: 100 },
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
        { resource: 'users', action: 'read' },
        { resource: 'users', action: 'create' },
        { resource: 'users', action: 'update' },
        { resource: 'users', action: 'delete' },
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
  }, CONTAINER_TIMEOUT_MS);

  describe('CRUD básico', () => {
    it('cria usuário com troca de senha obrigatória no primeiro acesso', async () => {
      const response = await createUserViaApi(`novo-${Date.now()}@teste.com`);
      const createdRecord = JSON.parse(response.body) as { mustChangePassword: boolean };

      expect(response.statusCode).toBe(201);
      expect(createdRecord.mustChangePassword).toBe(true);
    });

    it('recusa e-mail já cadastrado', async () => {
      const response = await createUserViaApi(admin.email);

      expect(response.statusCode).toBe(409);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('EMAIL_JA_CADASTRADO');
    });

    it('lista apenas usuários da própria empresa', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      await prisma.user.create({
        data: {
          email: `alheio-${Date.now()}@teste.com`,
          passwordHash: 'x',
          companyId: other.id,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${token}` },
      });
      const users = JSON.parse(response.body) as { email: string }[];

      expect(users.every((user) => !user.email.startsWith('alheio'))).toBe(true);
    });

    it('desativa em vez de excluir', async () => {
      const createdRecord = JSON.parse(
        (await createUserViaApi(`desativar-${Date.now()}@teste.com`)).body,
      ) as { id: string };

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/${createdRecord.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(204);
      const record = await prisma.user.findUnique({ where: { id: createdRecord.id } });
      expect(record?.status).toBe(UserStatus.INACTIVE);
    });
  });

  describe('limite do plano (critério de aceite)', () => {
    it(`permite criar até ${MAX_USERS} usuários ativos`, async () => {
      // O admin já ocupa 1 vaga.
      const second = await createUserViaApi(`u2-${Date.now()}@teste.com`);
      const third = await createUserViaApi(`u3-${Date.now()}@teste.com`);

      expect(second.statusCode).toBe(201);
      expect(third.statusCode).toBe(201);
    });

    it('BLOQUEIA a criação ao exceder o limite', async () => {
      await createUserViaApi(`u2-${Date.now()}@teste.com`);
      await createUserViaApi(`u3-${Date.now()}@teste.com`);

      const surplus = await createUserViaApi(`u4-${Date.now()}@teste.com`);

      expect(surplus.statusCode).toBe(422);
      expect((JSON.parse(surplus.body) as ErrorResponse).code).toBe('LIMITE_PLANO_EXCEDIDO');
    });

    it('desativar um usuário libera vaga', async () => {
      const second = JSON.parse((await createUserViaApi(`u2-${Date.now()}@teste.com`)).body) as {
        id: string;
      };
      await createUserViaApi(`u3-${Date.now()}@teste.com`);

      expect((await createUserViaApi(`cheio-${Date.now()}@teste.com`)).statusCode).toBe(422);

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/${second.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect((await createUserViaApi(`vaga-${Date.now()}@teste.com`)).statusCode).toBe(201);
    });

    it('exceder o limite não apaga quem já existe (RN-14)', async () => {
      await createUserViaApi(`u2-${Date.now()}@teste.com`);
      await createUserViaApi(`u3-${Date.now()}@teste.com`);
      await createUserViaApi(`u4-${Date.now()}@teste.com`);

      const active = await prisma.user.count({
        where: { companyId: company.id, status: UserStatus.ACTIVE },
      });
      expect(active).toBe(MAX_USERS);
    });
  });

  describe('auditoria (critério de aceite)', () => {
    it('registra a criação de usuário', async () => {
      await createUserViaApi(`auditado-${Date.now()}@teste.com`);

      const records = await prisma.auditLog.findMany({ where: { action: 'user.created' } });

      expect(records).toHaveLength(1);
      expect(records[0]?.userId).toBe(admin.id);
    });

    it('registra a desativação', async () => {
      const createdRecord = JSON.parse(
        (await createUserViaApi(`desativado-${Date.now()}@teste.com`)).body,
      ) as { id: string };

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/${createdRecord.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      const records = await prisma.auditLog.findMany({ where: { action: 'user.deactivated' } });
      expect(records).toHaveLength(1);
    });
  });

  describe('RN-04 — último Admin', () => {
    it('não permite desativar o último Admin ativo', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/${admin.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(422);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('ULTIMO_ADMIN');
    });
  });
});
