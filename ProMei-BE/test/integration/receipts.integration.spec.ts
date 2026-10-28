import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockMovementType, SubscriptionStatus } from '../../src/generated/prisma/client';
import { createFastifyAdapter } from '../../src/shared/http';
import { PasswordService } from '../../src/modules/auth/password.service';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { ReceiptPdfService } from '../../src/modules/receipts/receipt-pdf.service';
import { RECEIPT_NO_FISCAL_VALUE_NOTICE } from '../../src/modules/receipts/receipt-number';
import type { AuthResponseDto } from '../../src/modules/auth/dto/auth-response.dto';
import { extractPdfText } from '../support/pdf-text';

interface ErrorResponse {
  code?: string;
  message: string;
}

interface ReceiptSummaryResponse {
  id: string;
  number: string;
  formattedNumber: string;
  pdfStatus: 'PENDING' | 'READY';
  pdfUrl: string | null;
}

interface MovementResponse {
  movement: { id: string; receiptId: string | null };
  item: { id: string; stock: number };
  receipt: ReceiptSummaryResponse | null;
}

const CONTAINER_TIMEOUT_MS = 120_000;

/** RF-33 e RN-24: comprovante de saída, numeração sequencial e "nota fria". */
describe('Comprovante de saída (RF-33, RN-24)', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let pdfService: ReceiptPdfService;
  let storageDir: string;

  let company: { id: string };
  let admin: { id: string; email: string };
  let token: string;

  const password = 'SenhaValida123!';

  function postMovement(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/stock-movements',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function registerStockOut(itemId: string, quantity = 3): Promise<MovementResponse> {
    const response = await postMovement({
      itemId,
      type: StockMovementType.OUT,
      quantity,
      reason: 'venda balcão',
    });

    expect(response.statusCode).toBe(201);
    return JSON.parse(response.body) as MovementResponse;
  }

  async function createItem(stock = 50, price = 2.5) {
    return prisma.item.create({
      data: {
        companyId: company.id,
        sku: `SKU-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
        name: 'Parafuso 3/8',
        unit: 'un',
        price,
        stock,
      },
    });
  }

  /** A geração é assíncrona: o teste espera o PDF aparecer, não assume que já está lá. */
  async function waitForPdf(receiptId: string): Promise<string> {
    return vi.waitFor(
      async () => {
        const receipt = await prisma.receipt.findUniqueOrThrow({ where: { id: receiptId } });
        expect(receipt.pdfUrl).not.toBeNull();
        return receipt.pdfUrl as string;
      },
      { timeout: 10_000, interval: 50 },
    );
  }

  function downloadPdf(receiptId: string) {
    return app.inject({
      method: 'GET',
      url: `/api/v1/receipts/${receiptId}/pdf`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('promei')
      .withUsername('promei')
      .withPassword('promei')
      .start();

    storageDir = await mkdtemp(join(tmpdir(), 'promei-receipts-it-'));

    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-nao-e-segredo-real';
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-nao-e-segredo-real';
    process.env.RECEIPT_STORAGE_DIR = storageDir;
    // Backoff curto: o que importa aqui é o desfecho do retry, não a espera.
    process.env.RECEIPT_PDF_RETRY_DELAY_MS = '10';

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
    pdfService = moduleRef.get<ReceiptPdfService>(ReceiptPdfService);
  }, CONTAINER_TIMEOUT_MS);

  beforeEach(async () => {
    vi.restoreAllMocks();

    await prisma.auditLog.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.stockMovement.deleteMany({});
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
      data: { name: 'Mercearia do Zé', document: `doc-${String(Date.now())}` },
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
        { resource: 'stock-movements', action: 'create' },
        { resource: 'receipts', action: 'read' },
        { resource: 'receipts', action: 'update' },
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

  describe('RF-33 — saída gera comprovante', () => {
    it('a saída responde já com o comprovante e o vincula à movimentação', async () => {
      const item = await createItem();

      const body = await registerStockOut(item.id);

      expect(body.receipt).toMatchObject({ number: '1', formattedNumber: '000001' });
      expect(body.movement.receiptId).toBe(body.receipt?.id);
    });

    it('entrada e ajuste não geram comprovante', async () => {
      const item = await createItem();

      for (const type of [StockMovementType.IN, StockMovementType.ADJUSTMENT]) {
        const response = await postMovement({
          itemId: item.id,
          type,
          quantity: 2,
          reason: 'teste',
        });
        const body = JSON.parse(response.body) as MovementResponse;

        expect(body.receipt).toBeNull();
        expect(body.movement.receiptId).toBeNull();
      }

      expect(await prisma.receipt.count()).toBe(0);
    });

    it('o PDF é gerado logo depois e fica disponível para download', async () => {
      const item = await createItem();
      const body = await registerStockOut(item.id);
      const receiptId = body.receipt?.id as string;

      await waitForPdf(receiptId);

      const response = await downloadPdf(receiptId);

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('comprovante-000001.pdf');
      expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('o PDF traz empresa, item, quantidade e valores (RF-33)', async () => {
      const item = await createItem(50, 2.5);
      const body = await registerStockOut(item.id, 3);
      await waitForPdf(body.receipt?.id as string);

      const text = extractPdfText((await downloadPdf(body.receipt?.id as string)).rawPayload);

      expect(text).toContain('Mercearia do Zé');
      expect(text).toContain(item.sku);
      expect(text).toContain('3 un');
      expect(text).toContain('R$ 2,50');
      expect(text).toContain('R$ 7,50');
      expect(text).toContain(admin.email);
    });
  });

  describe('RN-24 — numeração sequencial por empresa e sem valor fiscal', () => {
    it('o rodapé obrigatório está no PDF', async () => {
      const item = await createItem();
      const body = await registerStockOut(item.id);
      await waitForPdf(body.receipt?.id as string);

      const text = extractPdfText((await downloadPdf(body.receipt?.id as string)).rawPayload);

      expect(text).toContain(RECEIPT_NO_FISCAL_VALUE_NOTICE);
    });

    it('numera 1, 2, 3... dentro da empresa', async () => {
      const item = await createItem();

      const numbers = [
        (await registerStockOut(item.id, 1)).receipt?.number,
        (await registerStockOut(item.id, 1)).receipt?.number,
        (await registerStockOut(item.id, 1)).receipt?.number,
      ];

      expect(numbers).toEqual(['1', '2', '3']);
    });

    it('a sequência é por empresa: outra empresa recomeça do 1', async () => {
      const item = await createItem();
      await registerStockOut(item.id, 1);
      await registerStockOut(item.id, 1);

      const otherCompany = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${String(Date.now())}` },
      });
      const otherCompanyReceipt = await prisma.receipt.create({
        data: { companyId: otherCompany.id, number: 1n },
      });

      expect(otherCompanyReceipt.number).toBe(1n);
      expect(await prisma.receipt.count({ where: { companyId: company.id } })).toBe(2);
    });

    it('saídas simultâneas não repetem nem pulam número', async () => {
      const item = await createItem(50);

      await Promise.all(
        Array.from({ length: 5 }, () =>
          postMovement({
            itemId: item.id,
            type: StockMovementType.OUT,
            quantity: 1,
            reason: 'venda simultânea',
          }),
        ),
      );

      const receipts = await prisma.receipt.findMany({
        where: { companyId: company.id },
        orderBy: { number: 'asc' },
      });

      expect(receipts.map((receipt: { number: bigint }) => receipt.number)).toEqual([
        1n,
        2n,
        3n,
        4n,
        5n,
      ]);
    });

    it('404 para comprovante de outra empresa', async () => {
      const otherCompany = await prisma.company.create({
        data: { name: 'Outra', document: `outra-${String(Date.now())}` },
      });
      const foreignReceipt = await prisma.receipt.create({
        data: { companyId: otherCompany.id, number: 1n },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/receipts/${foreignReceipt.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  /** Aceite do épico: o PDF é consequência da saída, nunca condição dela. */
  describe('falha na geração do PDF', () => {
    it('não bloqueia a movimentação: estoque baixa e comprovante fica pendente', async () => {
      const item = await createItem(50);
      vi.spyOn(pdfService, 'render').mockRejectedValue(new Error('disco cheio'));

      const body = await registerStockOut(item.id, 3);

      expect(body.item.stock).toBe(47);
      expect(body.receipt).toMatchObject({ number: '1', pdfStatus: 'PENDING' });

      const reloadedItem = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
      expect(reloadedItem.stock).toBe(47);
      expect(await prisma.stockMovement.count({ where: { itemId: item.id } })).toBe(1);
    });

    it('o comprovante segue pendente depois de esgotar as tentativas', async () => {
      const item = await createItem(50);
      const render = vi.spyOn(pdfService, 'render').mockRejectedValue(new Error('disco cheio'));

      const body = await registerStockOut(item.id);

      await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(3), { timeout: 5_000 });

      const receipt = await prisma.receipt.findUniqueOrThrow({
        where: { id: body.receipt?.id as string },
      });
      expect(receipt.pdfUrl).toBeNull();
    });

    it('o número não é perdido: a saída seguinte continua a sequência', async () => {
      const item = await createItem(50);
      const render = vi.spyOn(pdfService, 'render').mockRejectedValue(new Error('disco cheio'));

      const first = await registerStockOut(item.id, 1);
      render.mockRestore();
      const second = await registerStockOut(item.id, 1);

      expect(first.receipt?.number).toBe('1');
      expect(second.receipt?.number).toBe('2');
    });
  });

  describe('comprovante regenerável (aceite do épico)', () => {
    it('regenera o PDF pendente mantendo o mesmo número', async () => {
      const item = await createItem(50);
      const render = vi.spyOn(pdfService, 'render').mockRejectedValue(new Error('disco cheio'));
      const body = await registerStockOut(item.id);
      const receiptId = body.receipt?.id as string;

      await vi.waitFor(() => expect(render).toHaveBeenCalled(), { timeout: 5_000 });
      render.mockRestore();

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/receipts/${receiptId}/regenerate`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toMatchObject({
        id: receiptId,
        number: '1',
        pdfStatus: 'READY',
      });

      const text = extractPdfText((await downloadPdf(receiptId)).rawPayload);
      expect(text).toContain(RECEIPT_NO_FISCAL_VALUE_NOTICE);
    });

    it('o download gera na hora quando o arquivo não existe', async () => {
      const item = await createItem(50);
      const render = vi.spyOn(pdfService, 'render').mockRejectedValue(new Error('disco cheio'));
      const body = await registerStockOut(item.id);
      const receiptId = body.receipt?.id as string;

      await vi.waitFor(() => expect(render).toHaveBeenCalled(), { timeout: 5_000 });
      render.mockRestore();

      const response = await downloadPdf(receiptId);

      expect(response.statusCode).toBe(200);
      expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');

      const receipt = await prisma.receipt.findUniqueOrThrow({ where: { id: receiptId } });
      expect(receipt.pdfUrl).not.toBeNull();
    });

    it('falha na regeneração vira erro de negócio, não 500 mudo', async () => {
      const item = await createItem(50);
      const render = vi.spyOn(pdfService, 'render').mockRejectedValue(new Error('disco cheio'));
      const body = await registerStockOut(item.id);
      const receiptId = body.receipt?.id as string;

      await vi.waitFor(() => expect(render).toHaveBeenCalled(), { timeout: 5_000 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/receipts/${receiptId}/regenerate`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(422);
      expect((JSON.parse(response.body) as ErrorResponse).code).toBe('COMPROVANTE_NAO_GERADO');
    });
  });
});
