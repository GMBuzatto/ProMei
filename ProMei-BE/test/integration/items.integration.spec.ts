import { execSync } from 'node:child_process';
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ItemStatus,
  StockMovementType,
  SubscriptionStatus,
} from '../../src/generated/prisma/client';
import { createFastifyAdapter } from '../../src/shared/http';
import { PasswordService } from '../../src/modules/auth/password.service';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import type { AuthResponseDto } from '../../src/modules/auth/dto/auth-response.dto';

interface ErrorResponse {
  code?: string;
  message: string;
}

interface ItemResponse {
  id: string;
  sku: string;
  name: string;
  status: ItemStatus;
  category: string | null;
  description: string | null;
  stock: number;
  minStock: number;
  belowMinStock: boolean;
}

interface ListResponse {
  data: ItemResponse[];
  total: number;
  page: number;
  limit: number;
}

const CONTAINER_TIMEOUT_MS = 120_000;

/** CRUD de itens: RF-30/31 com RN-20, RN-23 e RN-25. */
describe('Itens (RF-30/31, RN-20/23/25)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;

  let company: { id: string };
  let admin: { id: string; email: string };
  let token: string;

  const password = 'SenhaValida123!';

  function createItem(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/items',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  function listItems(query = '') {
    return app.inject({
      method: 'GET',
      url: `/api/v1/items${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function createItemOk(payload: Record<string, unknown>): Promise<ItemResponse> {
    const response = await createItem(payload);
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body) as ItemResponse;
  }

  /** Movimentação é o que dispara RN-23 — sem ela o item ainda é excluível. */
  async function recordMovement(itemId: string) {
    await prisma.stockMovement.create({
      data: {
        companyId: company.id,
        itemId,
        userId: admin.id,
        type: StockMovementType.IN,
        quantity: 10,
        reason: 'carga inicial',
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
    await prisma.stockMovement.deleteMany({});
    await prisma.item.deleteMany({});
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
        { resource: 'items', action: 'read' },
        { resource: 'items', action: 'create' },
        { resource: 'items', action: 'update' },
        { resource: 'items', action: 'delete' },
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
  });

  afterAll(async () => {
    if (app) await app.close();
    if (container) await container.stop();
  }, CONTAINER_TIMEOUT_MS);

  describe('RF-30 — CRUD', () => {
    it('cria item com todos os campos do requisito', async () => {
      const item = await createItemOk({
        name: 'Parafuso 3/8',
        description: 'Sextavado galvanizado',
        sku: 'PARAF-001',
        unit: 'un',
        category: 'Fixadores',
        price: 2.5,
        minStock: 10,
      });

      expect(item).toMatchObject({
        sku: 'PARAF-001',
        name: 'Parafuso 3/8',
        description: 'Sextavado galvanizado',
        category: 'Fixadores',
        status: ItemStatus.ACTIVE,
      });
    });

    it('nasce com estoque zerado: saldo só entra por movimentação (RN-22)', async () => {
      const item = await createItemOk({ name: 'Bucha', unit: 'un', price: 1 });
      const storedRecord = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });

      expect(storedRecord.stock).toBe(0);
    });

    it('recusa saldo inicial enviado pelo cliente', async () => {
      const response = await createItem({ name: 'Bucha', unit: 'un', price: 1, stock: 999 });

      expect(response.statusCode).toBe(400);
    });

    it('atualiza campos do item', async () => {
      const item = await createItemOk({ name: 'Bucha', unit: 'un', price: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/items/${item.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Bucha 6mm', category: 'Fixadores' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({
        name: 'Bucha 6mm',
        category: 'Fixadores',
      });
    });

    it('404 para item de outra empresa', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      const foreignRecord = await prisma.item.create({
        data: { companyId: other.id, sku: 'ALHEIO-1', name: 'Alheio', unit: 'un', price: 1 },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/items/${foreignRecord.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('RN-25 — obrigatórios e SKU automático', () => {
    it('exige nome, unidade e preço', async () => {
      expect((await createItem({ unit: 'un', price: 1 })).statusCode).toBe(400);
      expect((await createItem({ name: 'X', price: 1 })).statusCode).toBe(400);
      expect((await createItem({ name: 'X', unit: 'un' })).statusCode).toBe(400);
    });

    it('gera SKU sequencial quando não informado', async () => {
      const first = await createItemOk({ name: 'Item A', unit: 'un', price: 1 });
      const second = await createItemOk({ name: 'Item B', unit: 'un', price: 1 });

      expect(first.sku).toBe('ITM-000001');
      expect(second.sku).toBe('ITM-000002');
    });

    it('SKU informado à mão não atrapalha a sequência automática', async () => {
      await createItemOk({ name: 'Manual', sku: 'PARAF-001', unit: 'un', price: 1 });
      const generated = await createItemOk({ name: 'Auto', unit: 'un', price: 1 });

      expect(generated.sku).toBe('ITM-000001');
    });
  });

  describe('RN-20 — SKU único por empresa', () => {
    it('recusa SKU repetido na mesma empresa', async () => {
      await createItemOk({ name: 'Primeiro', sku: 'PARAF-001', unit: 'un', price: 1 });

      const response = await createItem({
        name: 'Segundo',
        sku: 'PARAF-001',
        unit: 'un',
        price: 1,
      });

      expect(response.statusCode).toBe(409);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('SKU_JA_EXISTE');
    });

    it('permite o mesmo SKU em empresas diferentes', async () => {
      await createItemOk({ name: 'Nosso', sku: 'PARAF-001', unit: 'un', price: 1 });

      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      const foreignRecord = await prisma.item.create({
        data: { companyId: other.id, sku: 'PARAF-001', name: 'Deles', unit: 'un', price: 1 },
      });

      expect(foreignRecord.sku).toBe('PARAF-001');
    });
  });

  describe('RN-23 — item com movimentação inativa, não exclui', () => {
    it('inativa e mantém o item quando existe movimentação', async () => {
      const item = await createItemOk({ name: 'Com histórico', unit: 'un', price: 1 });
      await recordMovement(item.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/items/${item.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ outcome: 'INACTIVATED' });

      const storedRecord = await prisma.item.findUnique({ where: { id: item.id } });
      expect(storedRecord).not.toBeNull();
      expect(storedRecord?.status).toBe(ItemStatus.INACTIVE);
    });

    it('preserva a movimentação intacta após a inativação (RN-22)', async () => {
      const item = await createItemOk({ name: 'Com histórico', unit: 'un', price: 1 });
      await recordMovement(item.id);

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/items/${item.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(await prisma.stockMovement.count({ where: { itemId: item.id } })).toBe(1);
    });

    it('exclui de fato o item que nunca teve movimentação', async () => {
      const item = await createItemOk({ name: 'Sem histórico', unit: 'un', price: 1 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/items/${item.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(JSON.parse(response.body)).toMatchObject({ outcome: 'DELETED' });
      expect(await prisma.item.findUnique({ where: { id: item.id } })).toBeNull();
    });

    it('item inativado continua consultável e pode ser reativado', async () => {
      const item = await createItemOk({ name: 'Reativável', unit: 'un', price: 1 });
      await recordMovement(item.id);
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/items/${item.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/items/${item.id}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: ItemStatus.ACTIVE },
      });

      expect(response.statusCode).toBe(200);
      expect((JSON.parse(response.body) as ItemResponse).status).toBe(ItemStatus.ACTIVE);
    });
  });

  describe('RF-31 — busca, filtro e paginação', () => {
    beforeEach(async () => {
      await createItemOk({
        name: 'Parafuso sextavado',
        sku: 'PARAF-001',
        unit: 'un',
        price: 2.5,
        category: 'Fixadores',
      });
      await createItemOk({
        name: 'Porca sextavada',
        sku: 'PORCA-001',
        unit: 'un',
        price: 1.2,
        category: 'Fixadores',
      });
      await createItemOk({
        name: 'Fita isolante',
        sku: 'FITA-001',
        unit: 'rl',
        price: 8,
        category: 'Elétrica',
      });
    });

    it('busca por nome sem diferenciar maiúsculas', async () => {
      const response = await listItems('?search=PARAFUSO');
      const body = JSON.parse(response.body) as ListResponse;

      expect(body.total).toBe(1);
      expect(body.data[0]?.name).toBe('Parafuso sextavado');
    });

    it('busca também por SKU', async () => {
      const body = JSON.parse((await listItems('?search=FITA')).body) as ListResponse;

      expect(body.total).toBe(1);
      expect(body.data[0]?.sku).toBe('FITA-001');
    });

    it('filtra por categoria', async () => {
      const body = JSON.parse((await listItems('?category=Fixadores')).body) as ListResponse;

      expect(body.total).toBe(2);
      expect(body.data.every((item) => item.category === 'Fixadores')).toBe(true);
    });

    it('pagina o resultado', async () => {
      const body = JSON.parse((await listItems('?page=1&limit=2')).body) as ListResponse;

      expect(body).toMatchObject({ page: 1, limit: 2, total: 3 });
      expect(body.data).toHaveLength(2);
    });

    it('lista apenas itens da própria empresa', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${Date.now()}` },
      });
      await prisma.item.create({
        data: {
          companyId: other.id,
          sku: 'ALHEIO-1',
          name: 'Parafuso alheio',
          unit: 'un',
          price: 1,
        },
      });

      const body = JSON.parse((await listItems('?search=Parafuso')).body) as ListResponse;

      expect(body.total).toBe(1);
      expect(body.data[0]?.name).toBe('Parafuso sextavado');
    });
  });

  describe('RF-35 — alerta de estoque mínimo', () => {
    async function fetchItem(id: string): Promise<ItemResponse> {
      const apiResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/items/${id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      return JSON.parse(apiResponse.body) as ItemResponse;
    }

    it('belowMinStock é falso quando o saldo está no mínimo ou acima', async () => {
      const item = await createItemOk({ name: 'Parafuso', unit: 'un', price: 1, minStock: 10 });
      await prisma.item.update({ where: { id: item.id }, data: { stock: 10 } });

      expect((await fetchItem(item.id)).belowMinStock).toBe(false);
    });

    it('belowMinStock é verdadeiro quando o saldo cai abaixo do mínimo', async () => {
      const item = await createItemOk({ name: 'Parafuso', unit: 'un', price: 1, minStock: 10 });
      await prisma.item.update({ where: { id: item.id }, data: { stock: 9 } });

      expect((await fetchItem(item.id)).belowMinStock).toBe(true);
    });

    it('também aparece em GET /items, item a item', async () => {
      const critical = await createItemOk({ name: 'Crítico', unit: 'un', price: 1, minStock: 10 });
      await prisma.item.update({ where: { id: critical.id }, data: { stock: 5 } });
      const ok = await createItemOk({ name: 'OK', unit: 'un', price: 1, minStock: 10 });
      await prisma.item.update({ where: { id: ok.id }, data: { stock: 20 } });

      const responseBody = JSON.parse((await listItems()).body) as ListResponse;

      expect(responseBody.data.find((i) => i.id === critical.id)?.belowMinStock).toBe(true);
      expect(responseBody.data.find((i) => i.id === ok.id)?.belowMinStock).toBe(false);
    });
  });
});
