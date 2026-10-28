import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

interface MovementResponse {
  movement: {
    id: string;
    itemId: string;
    userId: string;
    type: StockMovementType;
    quantity: number;
    reason: string | null;
    createdAt: string;
  };
  item: { id: string; sku: string; name: string; stock: number };
  receipt: { id: string; number: string; formattedNumber: string } | null;
}

const CONTAINER_TIMEOUT_MS = 120_000;

/** RF-32 com RN-21/RN-22: movimentação em transação, com lock e saldo nunca negativo. */
describe('Movimentações de estoque (RF-32, RN-21/22)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let storageDir: string;

  let company: { id: string };
  let admin: { id: string; email: string };
  let token: string;

  const password = 'SenhaValida123!';

  function moveStock(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/stock-movements',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function moveStockOk(payload: Record<string, unknown>): Promise<MovementResponse> {
    const response = await moveStock(payload);
    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body) as MovementResponse;
  }

  /** Item criado direto no banco: o saldo inicial não passa pela API (RN-22). */
  async function createItem(stock = 0, status: ItemStatus = ItemStatus.ACTIVE) {
    return prisma.item.create({
      data: {
        companyId: company.id,
        sku: `SKU-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
        name: 'Parafuso 3/8',
        unit: 'un',
        price: 2.5,
        stock,
        status,
      },
    });
  }

  async function stockOf(itemId: string): Promise<number> {
    const item = await prisma.item.findUniqueOrThrow({ where: { id: itemId } });
    return item.stock;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('promei')
      .withUsername('promei')
      .withPassword('promei')
      .start();

    storageDir = await mkdtemp(join(tmpdir(), 'promei-movements-it-'));

    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-nao-e-segredo-real';
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-nao-e-segredo-real';
    // Saída gera comprovante (RF-33): os PDFs vão para um temporário, não para
    // dentro do repositório.
    process.env.RECEIPT_STORAGE_DIR = storageDir;

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
    // Saída gera comprovante (RF-33): sem limpar, a numeração da empresa nova
    // continuaria de onde o teste anterior parou.
    await prisma.receipt.deleteMany({});
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
      data: { name: 'Empresa Teste', document: `doc-${String(Date.now())}` },
    });

    const plan = await prisma.plan.create({
      data: {
        name: `Starter ${String(Date.now())}`,
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
        { resource: 'stock-movements', action: 'create' },
        { resource: 'stock-movements', action: 'read' },
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
        email: `admin-${String(Date.now())}@teste.com`,
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
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  }, CONTAINER_TIMEOUT_MS);

  describe('RF-32 — entrada, saída e ajuste', () => {
    it('entrada soma ao saldo e registra quem/quando/quantidade/motivo', async () => {
      const item = await createItem(0);

      const body = await moveStockOk({
        itemId: item.id,
        type: StockMovementType.IN,
        quantity: 25,
        reason: 'compra do fornecedor',
      });

      expect(body.item.stock).toBe(25);
      expect(body.movement).toMatchObject({
        itemId: item.id,
        userId: admin.id,
        type: StockMovementType.IN,
        quantity: 25,
        reason: 'compra do fornecedor',
      });
      expect(new Date(body.movement.createdAt).getTime()).toBeGreaterThan(0);
      expect(await stockOf(item.id)).toBe(25);
    });

    it('saída subtrai do saldo', async () => {
      const item = await createItem(50);

      const body = await moveStockOk({
        itemId: item.id,
        type: StockMovementType.OUT,
        quantity: 10,
        reason: 'venda balcão',
      });

      expect(body.item.stock).toBe(40);
      expect(await stockOf(item.id)).toBe(40);
    });

    it('ajuste aceita os dois sinais — é a diferença entre registrado e contado', async () => {
      const item = await createItem(50);

      await moveStockOk({
        itemId: item.id,
        type: StockMovementType.ADJUSTMENT,
        quantity: -3,
        reason: 'contagem física',
      });
      expect(await stockOf(item.id)).toBe(47);

      await moveStockOk({
        itemId: item.id,
        type: StockMovementType.ADJUSTMENT,
        quantity: 5,
        reason: 'item encontrado no depósito',
      });
      expect(await stockOf(item.id)).toBe(52);
    });

    it('exige motivo em toda movimentação', async () => {
      const item = await createItem(10);

      const response = await moveStock({
        itemId: item.id,
        type: StockMovementType.OUT,
        quantity: 1,
      });

      expect(response.statusCode).toBe(400);
    });

    it('recusa quantidade zero: movimentação que não move nada é ruído', async () => {
      const item = await createItem(10);

      const response = await moveStock({
        itemId: item.id,
        type: StockMovementType.IN,
        quantity: 0,
        reason: 'nada',
      });

      expect(response.statusCode).toBe(400);
    });

    it('recusa entrada com quantidade negativa: a direção vem do tipo', async () => {
      const item = await createItem(10);

      const response = await moveStock({
        itemId: item.id,
        type: StockMovementType.IN,
        quantity: -5,
        reason: 'tentativa de saída disfarçada',
      });

      expect(response.statusCode).toBe(400);
      expect(await stockOf(item.id)).toBe(10);
    });

    it('404 para item de outra empresa, sem tocar no saldo dele', async () => {
      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${String(Date.now())}` },
      });
      const foreignRecord = await prisma.item.create({
        data: {
          companyId: other.id,
          sku: 'ALHEIO-1',
          name: 'Alheio',
          unit: 'un',
          price: 1,
          stock: 100,
        },
      });

      const response = await moveStock({
        itemId: foreignRecord.id,
        type: StockMovementType.OUT,
        quantity: 10,
        reason: 'tentativa cross-tenant',
      });

      expect(response.statusCode).toBe(404);
      expect(await stockOf(foreignRecord.id)).toBe(100);
      expect(await prisma.stockMovement.count({ where: { itemId: foreignRecord.id } })).toBe(0);
    });
  });

  describe('RN-21 — estoque nunca fica negativo', () => {
    it('rejeita saída maior que o saldo com ESTOQUE_INSUFICIENTE', async () => {
      const item = await createItem(40);

      const response = await moveStock({
        itemId: item.id,
        type: StockMovementType.OUT,
        quantity: 100,
        reason: 'venda balcão',
      });

      expect(response.statusCode).toBe(422);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('ESTOQUE_INSUFICIENTE');
    });

    it('nada é gravado quando a saída é recusada — nem movimentação, nem saldo', async () => {
      const item = await createItem(40);

      await moveStock({
        itemId: item.id,
        type: StockMovementType.OUT,
        quantity: 100,
        reason: 'venda balcão',
      });

      expect(await stockOf(item.id)).toBe(40);
      expect(await prisma.stockMovement.count({ where: { itemId: item.id } })).toBe(0);
    });

    it('permite zerar o saldo exatamente', async () => {
      const item = await createItem(40);

      await moveStockOk({
        itemId: item.id,
        type: StockMovementType.OUT,
        quantity: 40,
        reason: 'venda balcão',
      });

      expect(await stockOf(item.id)).toBe(0);
    });

    it('ajuste negativo também não derruba o saldo abaixo de zero', async () => {
      const item = await createItem(5);

      const response = await moveStock({
        itemId: item.id,
        type: StockMovementType.ADJUSTMENT,
        quantity: -6,
        reason: 'contagem física',
      });

      expect(response.statusCode).toBe(422);
      expect(await stockOf(item.id)).toBe(5);
    });
  });

  /**
   * Aceite do épico: duas saídas simultâneas não podem "gastar" o mesmo saldo.
   *
   * Sem o `SELECT ... FOR UPDATE`, as duas requisições leriam 10, cada uma
   * gravaria 10-8=2 e o item teria entregue 16 unidades tendo 10.
   */
  describe('RN-21 sob concorrência — SELECT FOR UPDATE', () => {
    /**
     * Repetido em rodadas com itens novos de propósito: um único par pode se
     * serializar por sorte de agendamento e passar mesmo sem lock. Cobrar o
     * invariante em todas as rodadas tira a sorte da conta.
     */
    it('duas saídas simultâneas: uma passa, a outra é recusada', async () => {
      const items = await Promise.all(Array.from({ length: 5 }, () => createItem(10)));

      for (const item of items) {
        const [first, second] = await Promise.all([
          moveStock({
            itemId: item.id,
            type: StockMovementType.OUT,
            quantity: 8,
            reason: 'venda balcão A',
          }),
          moveStock({
            itemId: item.id,
            type: StockMovementType.OUT,
            quantity: 8,
            reason: 'venda balcão B',
          }),
        ]);

        const status = [first.statusCode, second.statusCode].sort((a, b) => a - b);
        expect(status).toEqual([201, 422]);

        const rejected = first.statusCode === 422 ? first : second;
        expect((JSON.parse(rejected.body) as ErrorResponse).code).toBe('ESTOQUE_INSUFICIENTE');

        expect(await stockOf(item.id)).toBe(2);
        expect(await prisma.stockMovement.count({ where: { itemId: item.id } })).toBe(1);
      }
    });

    /**
     * Prova direta do lock, sem depender de agendamento: o teste segura a linha
     * do item em outra transação e a requisição fica parada até o commit.
     */
    it('a saída espera a linha do item ser liberada', async () => {
      const item = await createItem(10);
      let responded = false;

      // A requisição fica FORA do retorno do callback: devolvê-la faria a
      // transação esperar por ela, que espera pela transação — impasse.
      let pending!: ReturnType<typeof moveStock>;

      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM items WHERE id = ${item.id}::uuid FOR UPDATE`;

        pending = moveStock({
          itemId: item.id,
          type: StockMovementType.OUT,
          quantity: 4,
          reason: 'venda balcão',
        }).then((response) => {
          responded = true;
          return response;
        });

        // Tempo de sobra para a requisição chegar no lock e ficar presa nele.
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(responded).toBe(false);
        expect(await stockOf(item.id)).toBe(10);
      });

      const response = await pending;

      expect(response.statusCode).toBe(201);
      expect(await stockOf(item.id)).toBe(6);
    });

    it('rajada de saídas: só o que cabe no saldo é gravado', async () => {
      const item = await createItem(10);

      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          moveStock({
            itemId: item.id,
            type: StockMovementType.OUT,
            quantity: 3,
            reason: `venda ${String(index)}`,
          }),
        ),
      );

      const accepted = responses.filter((response) => response.statusCode === 201);
      expect(accepted).toHaveLength(3);
      expect(await stockOf(item.id)).toBe(1);

      const stored = await prisma.stockMovement.aggregate({
        where: { itemId: item.id },
        _sum: { quantity: true },
        _count: true,
      });
      expect(stored._count).toBe(3);
      expect(stored._sum.quantity).toBe(9);
    });

    it('entradas simultâneas somam todas: o lock serializa, não descarta', async () => {
      const item = await createItem(0);

      await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          moveStockOk({
            itemId: item.id,
            type: StockMovementType.IN,
            quantity: 4,
            reason: `carga ${String(index)}`,
          }),
        ),
      );

      expect(await stockOf(item.id)).toBe(20);
    });

    it('o saldo final bate com a soma do histórico (RN-22)', async () => {
      const item = await createItem(30);

      await Promise.all([
        moveStock({
          itemId: item.id,
          type: StockMovementType.IN,
          quantity: 5,
          reason: 'entrada',
        }),
        moveStock({ itemId: item.id, type: StockMovementType.OUT, quantity: 7, reason: 'saída' }),
        moveStock({
          itemId: item.id,
          type: StockMovementType.ADJUSTMENT,
          quantity: -2,
          reason: 'ajuste',
        }),
      ]);

      const movements = await prisma.stockMovement.findMany({ where: { itemId: item.id } });
      const expectedStock = movements.reduce(
        (total: number, movement: { type: StockMovementType; quantity: number }) =>
          total +
          (movement.type === StockMovementType.OUT ? -movement.quantity : movement.quantity),
        30,
      );

      expect(await stockOf(item.id)).toBe(expectedStock);
    });
  });

  describe('RN-22 — histórico imutável', () => {
    it('não existe rota para editar ou apagar movimentação', async () => {
      const item = await createItem(10);
      const body = await moveStockOk({
        itemId: item.id,
        type: StockMovementType.OUT,
        quantity: 4,
        reason: 'venda balcão',
      });

      const update = await app.inject({
        method: 'PATCH',
        url: `/api/v1/stock-movements/${body.movement.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { quantity: 1 },
      });
      const remove = await app.inject({
        method: 'DELETE',
        url: `/api/v1/stock-movements/${body.movement.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(update.statusCode).toBe(404);
      expect(remove.statusCode).toBe(404);
      expect(await prisma.stockMovement.count({ where: { itemId: item.id } })).toBe(1);
    });

    it('correção é ajuste: a movimentação errada continua no histórico', async () => {
      const item = await createItem(10);
      await moveStockOk({
        itemId: item.id,
        type: StockMovementType.OUT,
        quantity: 8,
        reason: 'saída digitada errado',
      });

      await moveStockOk({
        itemId: item.id,
        type: StockMovementType.ADJUSTMENT,
        quantity: 5,
        reason: 'estorno parcial da saída anterior',
      });

      const movements = await prisma.stockMovement.findMany({
        where: { itemId: item.id },
        orderBy: { createdAt: 'asc' },
      });

      expect(movements).toHaveLength(2);
      expect(movements[0]).toMatchObject({ type: StockMovementType.OUT, quantity: 8 });
      expect(await stockOf(item.id)).toBe(7);
    });
  });

  describe('item inativo', () => {
    it('recusa saída em item inativo, mas aceita ajuste', async () => {
      const item = await createItem(10, ItemStatus.INACTIVE);

      const outbound = await moveStock({
        itemId: item.id,
        type: StockMovementType.OUT,
        quantity: 1,
        reason: 'venda balcão',
      });
      expect(outbound.statusCode).toBe(422);
      expect((JSON.parse(outbound.body) as ErrorResponse).code).toBe('ITEM_INATIVO');

      await moveStockOk({
        itemId: item.id,
        type: StockMovementType.ADJUSTMENT,
        quantity: -10,
        reason: 'baixa de saldo remanescente',
      });
      expect(await stockOf(item.id)).toBe(0);
    });
  });

  describe('permissão', () => {
    it('403 para usuário sem stock-movements:create', async () => {
      const item = await createItem(10);

      const withoutPermission = await prisma.user.create({
        data: {
          email: `colab-${String(Date.now())}@teste.com`,
          passwordHash: await passwordService.hashPassword(password),
          companyId: company.id,
        },
      });
      const role = await prisma.role.create({
        data: { companyId: company.id, name: 'Consulta' },
      });
      const read = await prisma.permission.findFirstOrThrow({
        where: { resource: 'items', action: 'read' },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: read.id },
      });
      await prisma.userRole.create({ data: { userId: withoutPermission.id, roleId: role.id } });

      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: withoutPermission.email, password },
      });
      const limitedToken = (JSON.parse(login.body) as AuthResponseDto).accessToken;

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/stock-movements',
        headers: { authorization: `Bearer ${limitedToken}` },
        payload: {
          itemId: item.id,
          type: StockMovementType.OUT,
          quantity: 1,
          reason: 'venda balcão',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(await stockOf(item.id)).toBe(10);
    });

    it('403 para usuário sem stock-movements:read', async () => {
      const restrictedUser = await prisma.user.create({
        data: {
          email: `colab-${String(Date.now())}@teste.com`,
          passwordHash: await passwordService.hashPassword(password),
          companyId: company.id,
        },
      });
      const restrictedRole = await prisma.role.create({
        data: { companyId: company.id, name: 'Sem leitura de histórico' },
      });
      const create = await prisma.permission.findFirstOrThrow({
        where: { resource: 'stock-movements', action: 'create' },
      });
      await prisma.rolePermission.create({
        data: { roleId: restrictedRole.id, permissionId: create.id },
      });
      await prisma.userRole.create({
        data: { userId: restrictedUser.id, roleId: restrictedRole.id },
      });

      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: restrictedUser.email, password: password },
      });
      const restrictedToken = (JSON.parse(login.body) as AuthResponseDto).accessToken;

      const apiResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/stock-movements',
        headers: { authorization: `Bearer ${restrictedToken}` },
      });

      expect(apiResponse.statusCode).toBe(403);
    });
  });

  describe('RF-34 — histórico de movimentações', () => {
    interface HistoryEntry {
      id: string;
      type: StockMovementType;
      quantity: number;
      reason: string | null;
      createdAt: string;
      item: { id: string; sku: string; name: string };
      user: { id: string; email: string };
      receipt: {
        id: string;
        number: string;
        formattedNumber: string;
        pdfStatus: 'PENDING' | 'READY';
        pdfUrl: string | null;
        createdAt: string;
      } | null;
    }

    interface HistoryResponse {
      data: HistoryEntry[];
      total: number;
      page: number;
      limit: number;
    }

    function listHistory(query = '') {
      return app.inject({
        method: 'GET',
        url: `/api/v1/stock-movements${query}`,
        headers: { authorization: `Bearer ${token}` },
      });
    }

    /**
     * A tela de histórico oferece o PDF de cada saída (RF-33). Sem o comprovante
     * nesta resposta ela precisaria de uma requisição por linha só para descobrir
     * o número — e a coluna ficaria vazia enquanto isso.
     */
    it('a saída traz o comprovante; entrada e ajuste vêm com null', async () => {
      const item = await createItem(50);

      const saida = await moveStockOk({
        itemId: item.id,
        type: StockMovementType.OUT,
        quantity: 4,
        reason: 'venda com comprovante',
      });
      await moveStockOk({
        itemId: item.id,
        type: StockMovementType.IN,
        quantity: 4,
        reason: 'reposição',
      });

      const responseBody = JSON.parse(
        (await listHistory(`?itemId=${item.id}`)).body,
      ) as HistoryResponse;

      const entradaEntry = responseBody.data.find((entry) => entry.type === 'IN');
      expect(entradaEntry?.receipt).toBeNull();

      const saidaEntry = responseBody.data.find((entry) => entry.type === 'OUT');
      expect(saidaEntry?.receipt).not.toBeNull();
      expect(saidaEntry?.receipt?.id).toBe(saida.receipt?.id);
      // BIGINT precisa sair como string: number cru estouraria no JSON do cliente.
      expect(typeof saidaEntry?.receipt?.number).toBe('string');
      expect(saidaEntry?.receipt?.formattedNumber).toBe(saida.receipt?.formattedNumber);
    });

    it('filtra por item', async () => {
      const bolt = await createItem(10);
      const nut = await createItem(10);

      await moveStockOk({
        itemId: bolt.id,
        type: StockMovementType.IN,
        quantity: 5,
        reason: 'entrada parafuso',
      });
      await moveStockOk({
        itemId: nut.id,
        type: StockMovementType.IN,
        quantity: 5,
        reason: 'entrada porca',
      });

      const responseBody = JSON.parse(
        (await listHistory(`?itemId=${bolt.id}`)).body,
      ) as HistoryResponse;

      expect(responseBody.total).toBe(1);
      expect(responseBody.data[0]?.item.id).toBe(bolt.id);
    });

    it('filtra por período', async () => {
      const item = await createItem(50);

      const previous = await moveStockOk({
        itemId: item.id,
        type: StockMovementType.OUT,
        quantity: 5,
        reason: 'venda antiga',
      });
      await prisma.stockMovement.update({
        where: { id: previous.movement.id },
        data: { createdAt: new Date('2020-01-01T00:00:00Z') },
      });
      await moveStockOk({
        itemId: item.id,
        type: StockMovementType.OUT,
        quantity: 5,
        reason: 'venda recente',
      });

      const responseBody = JSON.parse(
        (await listHistory('?dateFrom=2025-01-01&dateTo=2030-01-01')).body,
      ) as HistoryResponse;

      expect(responseBody.total).toBe(1);
      expect(responseBody.data[0]?.reason).toBe('venda recente');
    });

    it('recusa dateFrom depois de dateTo', async () => {
      const apiResponse = await listHistory('?dateFrom=2025-06-01&dateTo=2025-01-01');

      expect(apiResponse.statusCode).toBe(400);
      expect((JSON.parse(apiResponse.body) as ErrorResponse).code).toBe('VALIDACAO_FALHOU');
    });

    it('inclui item e usuário na resposta, sem o cliente precisar reconsultar', async () => {
      const item = await createItem(10);
      await moveStockOk({
        itemId: item.id,
        type: StockMovementType.OUT,
        quantity: 2,
        reason: 'venda balcão',
      });

      const responseBody = JSON.parse((await listHistory()).body) as HistoryResponse;

      expect(responseBody.data[0]).toMatchObject({
        item: { id: item.id, sku: item.sku, name: item.name },
        user: { id: admin.id, email: admin.email },
      });
    });

    it('pagina o resultado', async () => {
      const item = await createItem(100);
      for (let index = 0; index < 3; index += 1) {
        await moveStockOk({
          itemId: item.id,
          type: StockMovementType.OUT,
          quantity: 1,
          reason: `venda ${String(index)}`,
        });
      }

      const responseBody = JSON.parse(
        (await listHistory('?page=1&limit=2')).body,
      ) as HistoryResponse;

      expect(responseBody).toMatchObject({ page: 1, limit: 2, total: 3 });
      expect(responseBody.data).toHaveLength(2);
    });

    it('só retorna movimentações da própria empresa', async () => {
      const item = await createItem(10);
      await moveStockOk({
        itemId: item.id,
        type: StockMovementType.OUT,
        quantity: 1,
        reason: 'venda balcão',
      });

      const other = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${String(Date.now())}` },
      });
      const foreignRecord = await prisma.item.create({
        data: {
          companyId: other.id,
          sku: 'ALHEIO-1',
          name: 'Alheio',
          unit: 'un',
          price: 1,
          stock: 10,
        },
      });
      const otherUser = await prisma.user.create({
        data: {
          email: `outro-${String(Date.now())}@teste.com`,
          passwordHash: await passwordService.hashPassword(password),
          companyId: other.id,
        },
      });
      await prisma.stockMovement.create({
        data: {
          companyId: other.id,
          itemId: foreignRecord.id,
          userId: otherUser.id,
          type: StockMovementType.IN,
          quantity: 5,
          reason: 'entrada alheia',
        },
      });

      const responseBody = JSON.parse((await listHistory()).body) as HistoryResponse;

      expect(responseBody.total).toBe(1);
      expect(responseBody.data[0]?.item.id).toBe(item.id);
    });
  });
});
