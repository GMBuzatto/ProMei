import { execSync } from 'node:child_process';
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
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

interface RolePayload {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}

const CONTAINER_TIMEOUT_MS = 120_000;

/** CRUD de papéis (RF-12) e a regra do último Admin (RN-04). */
describe('Roles Integration — RF-12 e RN-04', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  let company: { id: string };
  let otherCompany: { id: string };
  let adminRole: { id: string };
  let collaboratorRole: { id: string };
  let admin: { id: string; email: string };
  let secondAdmin: { id: string; email: string };
  let collaborator: { id: string; email: string };

  const password = 'SenhaValida123!';
  let tokenAdmin: string;

  async function login(email: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    return (JSON.parse(response.body) as AuthResponseDto).accessToken;
  }

  async function asAdmin(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) {
    return app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${tokenAdmin}` },
      ...(payload ? { payload } : {}),
    });
  }

  async function createUser(email: string, roleId: string): Promise<{ id: string; email: string }> {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await passwordService.hashPassword(password),
        companyId: company.id,
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId } });
    return user;
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
    await prisma.company.deleteMany({});
    await prisma.permission.deleteMany({});

    company = await prisma.company.create({
      data: { name: 'Empresa A', document: `doc-a-${Date.now()}` },
    });
    otherCompany = await prisma.company.create({
      data: { name: 'Empresa B', document: `doc-b-${Date.now()}` },
    });

    const permissions = await prisma.permission.createManyAndReturn({
      data: [
        { resource: 'roles', action: 'read' },
        { resource: 'roles', action: 'create' },
        { resource: 'roles', action: 'update' },
        { resource: 'roles', action: 'delete' },
        { resource: 'users', action: 'update' },
        { resource: 'items', action: 'read' },
      ],
    });

    adminRole = await prisma.role.create({
      data: { companyId: company.id, name: 'Admin', isSystem: true },
    });
    collaboratorRole = await prisma.role.create({
      data: { companyId: company.id, name: 'Colaborador', isSystem: true },
    });

    await prisma.rolePermission.createMany({
      data: permissions.map((permission: { id: string }) => ({
        roleId: adminRole.id,
        permissionId: permission.id,
      })),
    });

    admin = await createUser(`admin-${Date.now()}@teste.com`, adminRole.id);
    secondAdmin = await createUser(`admin2-${Date.now()}@teste.com`, adminRole.id);
    collaborator = await createUser(`colab-${Date.now()}@teste.com`, collaboratorRole.id);

    tokenAdmin = await login(admin.email);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
  }, CONTAINER_TIMEOUT_MS);

  describe('CRUD de papéis', () => {
    it('lista os papéis da empresa com suas permissões', async () => {
      const response = await asAdmin('GET', '/api/v1/roles');
      const roles = JSON.parse(response.body) as RolePayload[];

      expect(response.statusCode).toBe(200);
      expect(roles.map((role) => role.name).sort()).toEqual(['Admin', 'Colaborador']);
    });

    it('cria papel customizado com permissões', async () => {
      const response = await asAdmin('POST', '/api/v1/roles', {
        name: 'Estoquista',
        permissions: ['items:read'],
      });
      const role = JSON.parse(response.body) as RolePayload;

      expect(response.statusCode).toBe(201);
      expect(role.isSystem).toBe(false);
      expect(role.permissions).toEqual(['items:read']);
    });

    it('recusa nome duplicado na mesma empresa', async () => {
      await asAdmin('POST', '/api/v1/roles', { name: 'Estoquista', permissions: [] });
      const response = await asAdmin('POST', '/api/v1/roles', {
        name: 'Estoquista',
        permissions: [],
      });

      expect(response.statusCode).toBe(409);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('PAPEL_JA_EXISTE');
    });

    it('recusa permissão que não existe no catálogo', async () => {
      const response = await asAdmin('POST', '/api/v1/roles', {
        name: 'Fantasma',
        permissions: ['items:teletransportar'],
      });

      expect(response.statusCode).toBe(422);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('PERMISSAO_INEXISTENTE');
    });

    it('atualiza permissões substituindo o conjunto', async () => {
      const created = JSON.parse(
        (
          await asAdmin('POST', '/api/v1/roles', {
            name: 'Estoquista',
            permissions: ['items:read'],
          })
        ).body,
      ) as RolePayload;

      const response = await asAdmin('PATCH', `/api/v1/roles/${created.id}`, {
        permissions: ['roles:read'],
      });
      const updated = JSON.parse(response.body) as RolePayload;

      expect(updated.permissions).toEqual(['roles:read']);
    });

    it('exclui papel customizado', async () => {
      const created = JSON.parse(
        (await asAdmin('POST', '/api/v1/roles', { name: 'Temporario', permissions: [] })).body,
      ) as RolePayload;

      const response = await asAdmin('DELETE', `/api/v1/roles/${created.id}`);

      expect(response.statusCode).toBe(204);
      expect(await prisma.role.findUnique({ where: { id: created.id } })).toBeNull();
    });
  });

  describe('papéis de sistema são imutáveis (critério de aceite)', () => {
    it('não permite renomear', async () => {
      const response = await asAdmin('PATCH', `/api/v1/roles/${adminRole.id}`, {
        name: 'Administrador',
      });

      expect(response.statusCode).toBe(422);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('PAPEL_DE_SISTEMA_IMUTAVEL');
    });

    it('não permite alterar as permissões', async () => {
      const response = await asAdmin('PATCH', `/api/v1/roles/${collaboratorRole.id}`, {
        permissions: ['items:read'],
      });

      expect(response.statusCode).toBe(422);
    });

    it('não permite excluir', async () => {
      const response = await asAdmin('DELETE', `/api/v1/roles/${collaboratorRole.id}`);

      expect(response.statusCode).toBe(422);
      expect(await prisma.role.findUnique({ where: { id: collaboratorRole.id } })).not.toBeNull();
    });
  });

  describe('RN-04 — último Admin (critério de aceite)', () => {
    it('permite remover o papel Admin enquanto houver outro administrador', async () => {
      const response = await asAdmin(
        'DELETE',
        `/api/v1/roles/users/${secondAdmin.id}/${adminRole.id}`,
      );

      expect(response.statusCode).toBe(204);
    });

    it('recusa remover o papel do ÚLTIMO Admin', async () => {
      await asAdmin('DELETE', `/api/v1/roles/users/${secondAdmin.id}/${adminRole.id}`);

      const response = await asAdmin('DELETE', `/api/v1/roles/users/${admin.id}/${adminRole.id}`);

      expect(response.statusCode).toBe(422);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('ULTIMO_ADMIN');
    });

    it('o último Admin continua com o papel após a recusa', async () => {
      await asAdmin('DELETE', `/api/v1/roles/users/${secondAdmin.id}/${adminRole.id}`);
      await asAdmin('DELETE', `/api/v1/roles/users/${admin.id}/${adminRole.id}`);

      const grant = await prisma.userRole.findFirst({
        where: { userId: admin.id, roleId: adminRole.id },
      });
      expect(grant).not.toBeNull();
    });

    it('atribui papel a um usuário da empresa', async () => {
      const response = await asAdmin('POST', `/api/v1/roles/users/${collaborator.id}`, {
        roleId: adminRole.id,
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe('escopo de tenant', () => {
    it('papel de outra empresa responde 404', async () => {
      const foreignRecord = await prisma.role.create({
        data: { companyId: otherCompany.id, name: 'Alheio' },
      });

      const response = await asAdmin('GET', `/api/v1/roles/${foreignRecord.id}`);

      expect(response.statusCode).toBe(404);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('RECURSO_NAO_ENCONTRADO');
    });

    it('a listagem não inclui papéis de outra empresa', async () => {
      await prisma.role.create({ data: { companyId: otherCompany.id, name: 'Alheio' } });

      const roles = JSON.parse((await asAdmin('GET', '/api/v1/roles')).body) as RolePayload[];

      expect(roles.some((role) => role.name === 'Alheio')).toBe(false);
    });
  });

  describe('permissão exigida (RF-13)', () => {
    it('colaborador sem roles:read recebe 403', async () => {
      const collaboratorToken = await login(collaborator.email);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/roles',
        headers: { authorization: `Bearer ${collaboratorToken}` },
      });

      expect(response.statusCode).toBe(403);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('PERMISSAO_NEGADA');
    });
  });
});
