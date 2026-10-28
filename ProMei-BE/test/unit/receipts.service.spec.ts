import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ReceiptsService } from '../../src/modules/receipts/receipts.service';
import { ReceiptPdfService } from '../../src/modules/receipts/receipt-pdf.service';
import { ReceiptStorageService } from '../../src/modules/receipts/receipt-storage.service';
import {
  RECEIPT_NO_FISCAL_VALUE_NOTICE,
  formatReceiptNumber,
} from '../../src/modules/receipts/receipt-number';
import type { AuditService } from '../../src/modules/audit/audit.service';
import type { PrismaService } from '../../src/shared/prisma';
import type { BusinessException } from '../../src/shared/errors';
import { extractPdfText } from '../support/pdf-text';

const COMPANY = '11111111-1111-1111-1111-111111111111';
const RECEIPT = '22222222-2222-2222-2222-222222222222';

let storageDir: string;

const ENV: Record<string, string | number> = {
  RECEIPT_NUMBER_PADDING: 6,
  RECEIPT_PDF_MAX_ATTEMPTS: 3,
  // Backoff mínimo: o teste cobre a repetição, não a espera.
  RECEIPT_PDF_RETRY_DELAY_MS: 1,
};

function createConfig(): ConfigService<Record<string, unknown>, true> {
  return {
    get: (key: string) => (key === 'RECEIPT_STORAGE_DIR' ? storageDir : ENV[key]),
  } as unknown as ConfigService<Record<string, unknown>, true>;
}

const storedReceipt = {
  id: RECEIPT,
  companyId: COMPANY,
  number: 7n,
  pdfUrl: null as string | null,
  createdAt: new Date('2026-08-13T10:30:00Z'),
};

const receiptWithMovement = {
  ...storedReceipt,
  company: { name: 'Mercearia do Zé', document: '12345678000199' },
  stockMovement: {
    quantity: 3,
    reason: 'venda balcão',
    createdAt: new Date('2026-08-13T10:30:00Z'),
    user: { email: 'ze@mercearia.com' },
    item: { sku: 'PARAF-001', name: 'Parafuso 3/8', unit: 'un', price: 2.5 },
  },
};

/** Executa e devolve a BusinessException lançada — falha o teste se não lançar. */
async function captureError(action: () => Promise<unknown>): Promise<BusinessException> {
  try {
    await action();
  } catch (error) {
    return error as BusinessException;
  }
  throw new Error('Esperava uma exceção, mas a chamada foi bem-sucedida');
}

function createService(
  options: {
    /** Falhas que o render deve lançar, em ordem, antes de finalmente funcionar. */
    renderFailures?: number;
    receipt?: typeof receiptWithMovement | null;
  } = {},
) {
  const { renderFailures = 0, receipt = receiptWithMovement } = options;

  const config = createConfig();
  const storage = new ReceiptStorageService(config);
  const realPdf = new ReceiptPdfService();

  let remainingFailures = renderFailures;
  const render = vi.fn(async (data: Parameters<ReceiptPdfService['render']>[0]) => {
    if (remainingFailures > 0) {
      remainingFailures -= 1;
      throw new Error('disco cheio');
    }
    return realPdf.render(data);
  });
  const pdf = { render } as unknown as ReceiptPdfService;

  const update = vi.fn((args: { data: { pdfUrl: string } }) =>
    Promise.resolve({ ...storedReceipt, pdfUrl: args.data.pdfUrl }),
  );

  const prisma = {
    db: {
      receipt: {
        findFirst: vi.fn(() => Promise.resolve(receipt)),
        update,
      },
    },
  } as unknown as PrismaService;

  const log = vi.fn(() => Promise.resolve());

  const service = new ReceiptsService(prisma, config, pdf, storage, {
    log,
  } as unknown as AuditService);

  return { service, render, update, storage, log };
}

beforeAll(async () => {
  storageDir = await mkdtemp(join(tmpdir(), 'promei-receipts-'));
});

afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
});

describe('formatReceiptNumber (RN-24)', () => {
  it('aplica o padding configurado', () => {
    expect(formatReceiptNumber(123, 6)).toBe('000123');
    expect(formatReceiptNumber(1n, 6)).toBe('000001');
  });

  it('número maior que o padding não é truncado: o padding é só apresentação', () => {
    expect(formatReceiptNumber(1_234_567, 6)).toBe('1234567');
  });
});

describe('ReceiptPdfService (RF-33, RN-24)', () => {
  const data = {
    number: '000007',
    issuedAt: new Date('2026-08-13T10:30:00'),
    company: { name: 'Mercearia do Zé', document: '12345678000199' },
    issuedBy: 'ze@mercearia.com',
    reason: 'venda balcão',
    lines: [
      {
        sku: 'PARAF-001',
        name: 'Parafuso 3/8',
        unit: 'un',
        quantity: 3,
        unitPrice: '2.50',
        total: '7.50',
      },
    ],
  };

  it('gera um PDF válido', async () => {
    const buffer = await new ReceiptPdfService().render(data);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('traz o rodapé obrigatório "Documento sem valor fiscal"', async () => {
    const buffer = await new ReceiptPdfService().render(data);

    expect(extractPdfText(buffer)).toContain(RECEIPT_NO_FISCAL_VALUE_NOTICE);
  });

  it('traz empresa, número, item, quantidade e valores (RF-33)', async () => {
    const content = extractPdfText(await new ReceiptPdfService().render(data));

    expect(content).toContain('Mercearia do Zé');
    expect(content).toContain('12345678000199');
    expect(content).toContain('000007');
    expect(content).toContain('PARAF-001');
    expect(content).toContain('3 un');
    // Unitário 2,50 e total 7,50 — valores são parte do requisito.
    expect(content).toContain('R$ 2,50');
    expect(content).toContain('R$ 7,50');
  });
});

describe('ReceiptsService', () => {
  describe('geração assíncrona com retry', () => {
    it('grava o PDF e aponta o pdf_url para a chave do storage', async () => {
      const { service, update, storage } = createService();

      service.schedulePdfGeneration(RECEIPT, COMPANY);
      await vi.waitFor(() => expect(update).toHaveBeenCalled());

      const key = storage.buildKey(COMPANY, RECEIPT);
      expect(update.mock.calls[0]?.[0].data.pdfUrl).toBe(key);
      expect(await storage.exists(key)).toBe(true);
    });

    it('tenta de novo depois de falhar e acaba gerando', async () => {
      const { service, render, update } = createService({ renderFailures: 2 });

      service.schedulePdfGeneration(RECEIPT, COMPANY);
      await vi.waitFor(() => expect(update).toHaveBeenCalled());

      expect(render).toHaveBeenCalledTimes(3);
    });

    it('esgotadas as tentativas, desiste em silêncio e deixa o comprovante pendente', async () => {
      const { service, render, update } = createService({ renderFailures: 99 });

      service.schedulePdfGeneration(RECEIPT, COMPANY);
      await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(3));

      // Nada de pdf_url: pendente é exatamente isso.
      expect(update).not.toHaveBeenCalled();
    });

    it('falha na geração não propaga para quem registrou a saída', () => {
      const { service } = createService({ renderFailures: 99 });

      // Sem await de propósito: o contrato é justamente não fazer o chamador esperar.
      expect(() => {
        service.schedulePdfGeneration(RECEIPT, COMPANY);
      }).not.toThrow();
    });
  });

  describe('regeneração', () => {
    it('regenera o PDF mantendo o número do comprovante', async () => {
      const { service, storage } = createService();

      const summary = await service.regenerate(RECEIPT, COMPANY, 'user-1', '127.0.0.1');

      expect(summary).toMatchObject({ number: '7', formattedNumber: '000007', pdfStatus: 'READY' });
      const stored = await readFile(join(storageDir, storage.buildKey(COMPANY, RECEIPT)));
      expect(stored.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('registra a regeneração na auditoria', async () => {
      const { service, log } = createService();

      await service.regenerate(RECEIPT, COMPANY, 'user-1', '127.0.0.1');

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'receipt.regenerated', resource: 'receipts' }),
      );
    });

    it('propaga a falha: quem clicou em regenerar precisa saber que não deu', async () => {
      const { service } = createService({ renderFailures: 99 });

      const error = await captureError(() => service.regenerate(RECEIPT, COMPANY));

      expect(error.code).toBe('COMPROVANTE_NAO_GERADO');
    });

    it('404 para comprovante de outra empresa', async () => {
      const { service } = createService({ receipt: null });

      const error = await captureError(() => service.regenerate(RECEIPT, COMPANY));

      expect(error.code).toBe('RECURSO_NAO_ENCONTRADO');
    });
  });

  describe('download', () => {
    it('gera na hora quando o comprovante ainda está pendente', async () => {
      const { service, render } = createService();

      const file = await service.getPdfFile(RECEIPT, COMPANY);

      expect(render).toHaveBeenCalledOnce();
      expect(file.filename).toBe('comprovante-000007.pdf');
      expect(file.content.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });
});
