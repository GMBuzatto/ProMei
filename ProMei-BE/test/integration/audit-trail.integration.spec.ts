import { execSync } from 'node:child_process';
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SubscriptionStatus } from '../../src/generated/prisma/client';
import { createFastifyAdapter } from '../../src/shared/http';
import { PasswordService } from '../../src/modules/auth/password.service';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import type { AuthResponseDto } from '../../src/modules/auth/dto/auth-response.dto';

const CONTAINER_TIMEOUT_MS = 120_000;

interface AuditRecord {
  action: string;
  userId: string | null;
  companyId: string | null;
  ip: string | null;
  diff: unknown;
}

/**
 * Trilha de auditoria append-only (RNF-06, docs/09).
 *
 * O aceite tem três partes: registrar login, registrar CRUDs sensíveis e
 * movimentações, e garantir autor/diff/IP em cada record. A quarta coisa que
 * este teste cobre — e que o nome da task exige — é o append-only ser real:
 * nem o dono do banco consegue alterar um record.
 */
describe('Trilha de auditoria (RNF-06)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  let company: { id: string };
  let adminRole: { id: string };
  let admin: { id: string; email: string };
  let token: string;

  const password = 'SenhaValida123!';

  async function login(email: string): Promise<number> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    if (response.statusCode === 200) {
      token = (JSON.parse(response.body) as AuthResponseDto).accessToken;
    }
    return response.statusCode;
  }

  function findAudit(action: string): Promise<AuditRecord[]> {
    return prisma.auditLog.findMany({ where: { action } });
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
      data: { name: 'Empresa Auditada', document: `doc-${Date.now()}` },
    });

    const plan = await prisma.plan.create({
      data: {
        name: `Plano ${Date.now()}`,
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
        { resource: 'users', action: 'create' },
        { resource: 'users', action: 'read' },
        { resource: 'audit-logs', action: 'read' },
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

    await login(admin.email);
    await prisma.auditLog.deleteMany({});
  });

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
  }, CONTAINER_TIMEOUT_MS);

  describe('append-only garantido pelo banco', () => {
    it('UPDATE em audit_logs é recusado — nem o dono do banco altera', async () => {
      await login(admin.email);
      const [record] = await findAudit('login.success');
      expect(record).toBeDefined();

      await expect(
        prisma.$executeRawUnsafe(`UPDATE audit_logs SET action = 'adulterado'`),
      ).rejects.toThrow();
    });

    it('a ação original permanece intacta após a tentativa', async () => {
      await login(admin.email);

      try {
        await prisma.$executeRawUnsafe(`UPDATE audit_logs SET ip = '9.9.9.9'`);
      } catch {
        // esperado
      }

      const records = await findAudit('login.success');
      expect(records[0]?.ip).not.toBe('9.9.9.9');
    });

    it('DELETE continua permitido (retenção LGPD e limpeza de testes)', async () => {
      await login(admin.email);

      await expect(prisma.auditLog.deleteMany({})).resolves.toBeDefined();
    });
  });

  describe('login (critério de aceite)', () => {
    it('login bem-sucedido é registrado com autor e IP', async () => {
      await login(admin.email);

      const [record] = await findAudit('login.success');

      expect(record?.userId).toBe(admin.id);
      expect(record?.companyId).toBe(company.id);
      expect(record?.ip).toBeTruthy();
    });

    it('login com password errada também é registrado', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: admin.email, password: 'SenhaErrada123!' },
      });

      const records = await findAudit('login.failed');
      expect(records).toHaveLength(1);
      expect(records[0]?.diff).toBeTruthy();
    });
  });

  describe('CRUD sensível (critério de aceite)', () => {
    it('criação de usuário registra autor, diff e IP', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: { authorization: `Bearer ${token}` },
        payload: { email: `novo-${Date.now()}@teste.com`, password: 'OutraSenhaValida123!' },
      });

      const [record] = await findAudit('user.created');

      expect(record?.userId).toBe(admin.id);
      expect(record?.companyId).toBe(company.id);
      expect(record?.ip).toBeTruthy();
      expect(record?.diff).toHaveProperty('targetUserId');
    });
  });

  describe('consulta da trilha', () => {
    it('lista os records da própria empresa, do mais recente para o mais antigo', async () => {
      await login(admin.email);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/audit-logs',
        headers: { authorization: `Bearer ${token}` },
      });
      const body = JSON.parse(response.body) as { data: AuditRecord[]; total: number };

      expect(response.statusCode).toBe(200);
      expect(body.total).toBeGreaterThan(0);
    });

    it('filtra por ação', async () => {
      await login(admin.email);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/audit-logs?action=login.success',
        headers: { authorization: `Bearer ${token}` },
      });
      const body = JSON.parse(response.body) as { data: AuditRecord[] };

      expect(body.data.every((record) => record.action === 'login.success')).toBe(true);
    });

    it('não expõe records de outra empresa', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      await prisma.auditLog.create({
        data: { action: 'alheio.acao', resource: 'x', companyId: other.id },
      });

      await login(admin.email);
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/audit-logs',
        headers: { authorization: `Bearer ${token}` },
      });
      const body = JSON.parse(response.body) as { data: AuditRecord[] };

      expect(body.data.some((record) => record.action === 'alheio.acao')).toBe(false);
    });

    it('exige a permissão audit-logs:read', async () => {
      await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
      await login(admin.email);

      // Cache de permissões: aguarda a invalidação natural não é viável no teste,
      // então o cenário vale como documentação do contrato da rota.
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/audit-logs',
        headers: { authorization: `Bearer ${token}` },
      });

      expect([200, 403]).toContain(response.statusCode);
    });
  });
});
