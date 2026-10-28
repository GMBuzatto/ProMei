import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PaymentMethod, SaleKind, type Receipt } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BusinessErrorCode, BusinessException } from '../../shared/errors';
import type { Env } from '../../shared/config';
import { AuditService } from '../audit/audit.service';
// Arquivos-folha, não o barrel `../sales` — o barrel puxa `sales.module.ts`,
// que importa `ReceiptsModule`, e isso fecharia um ciclo de módulos. As
// funções puras não têm esse problema.
import { calculateBalance, calculateItemTotal, calculateSaleTotal } from '../sales/sale-totals';
import { formatSaleNumber } from '../sales/sale-number';
import { formatReceiptNumber } from './receipt-number';
import { ReceiptPdfService, type ReceiptPdfData } from './receipt-pdf.service';
import { ReceiptStorageService } from './receipt-storage.service';

const { Decimal } = Prisma;

/** docs/33: rótulo em pt-BR do meio de pagamento, já pronto para o PDF. */
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Dinheiro',
  [PaymentMethod.CREDIT_CARD]: 'Cartão de crédito',
  [PaymentMethod.DEBIT_CARD]: 'Cartão de débito',
  [PaymentMethod.PIX]: 'PIX',
  [PaymentMethod.OTHER]: 'Outro',
};

/**
 * `PENDING` é o comprovante cujo PDF ainda não existe — recém-emitido ou com a
 * geração falhada. Nos dois casos o desfecho é o mesmo: o número já é válido e o
 * PDF é regenerável (docs/06).
 */
export type ReceiptPdfStatus = 'PENDING' | 'READY';

export interface ReceiptSummary {
  id: string;
  /** Sequencial cru, como string: `number` é BIGINT e não sobrevive ao JSON. */
  number: string;
  /** O mesmo número como sai impresso, com o padding de RN-24. */
  formattedNumber: string;
  pdfStatus: ReceiptPdfStatus;
  pdfUrl: string | null;
  createdAt: Date;
}

export interface ReceiptPdfFile {
  content: Buffer;
  filename: string;
}

const RECEIPTS_RESOURCE = 'receipts';

/**
 * Namespace dos advisory locks de numeração. Constante (não configuração): é
 * identificador, como nome de tabela — mudar por ambiente só criaria a chance de
 * dois processos numerarem em paralelo achando que estão sincronizados.
 */
const RECEIPT_NUMBERING_LOCK_NAMESPACE = 4271;

interface ReceiptWithMovement {
  id: string;
  number: bigint;
  createdAt: Date;
  company: { name: string; document: string };
  stockMovement: {
    quantity: number;
    reason: string | null;
    createdAt: Date;
    user: { email: string };
    item: { sku: string; name: string; unit: string; price: unknown };
  } | null;
  // Comprovante de VENDA (docs/23#impacto-no-comprovante, docs/33, RN-86):
  // exatamente uma das duas origens é preenchida — nunca as duas, nunca
  // nenhuma.
  sale: {
    number: bigint;
    kind: SaleKind;
    paymentMethod: PaymentMethod | null;
    discount: unknown;
    total: unknown;
    paidAmount: unknown;
    dueDate: Date | null;
    canceledAt: Date | null;
    createdByUser: { email: string };
    customer: { name: string; document: string | null; phone: string | null } | null;
    items: {
      quantity: number;
      unitPrice: unknown;
      total: unknown;
      itemSkuSnapshot: string;
      itemNameSnapshot: string;
      item: { unit: string };
    }[];
  } | null;
}

/**
 * Comprovante de saída — a "nota fria" do MEI (RF-33, RN-24).
 *
 * Duas coisas separadas de propósito:
 *
 * 1. **Numerar e registrar** o comprovante acontece dentro da transação da
 *    movimentação. O número é sequencial por empresa e não pode ter buraco nem
 *    repetição, então nasce junto do fato que ele documenta.
 * 2. **Gerar o PDF** acontece depois do commit, assíncrono e com retry. É a única
 *    parte que pode falhar sem consequência: o estoque já baixou, o comprovante
 *    já tem número, e o arquivo é derivável do banco a qualquer momento
 *    (docs/11: PDFs não são fonte de verdade).
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly pdf: ReceiptPdfService,
    private readonly storage: ReceiptStorageService,
    private readonly audit: AuditService,
  ) {}

  /**
   * RN-24: reserva o próximo número da empresa e cria o comprovante, **dentro**
   * da transação que a movimentação está usando.
   *
   * O advisory lock serializa apenas a numeração daquela empresa e é liberado no
   * commit. Sem ele, duas saídas simultâneas leriam o mesmo `MAX(number)` e uma
   * das duas bateria no índice único `(company_id, number)` — o que aborta a
   * transação inteira no Postgres, derrubando junto uma movimentação que já era
   * válida. Serializar antes é mais barato que tratar depois.
   */
  /**
   * `saleId`: comprovante de VENDA (docs/23), um por venda — nunca um por
   * item (RN-86). Omitido, o comprovante é de saída manual (MVP), como
   * sempre foi.
   */
  async allocate(
    tx: Prisma.TransactionClient,
    companyId: string,
    saleId?: string,
  ): Promise<Receipt> {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(${RECEIPT_NUMBERING_LOCK_NAMESPACE}, hashtext(${companyId}))
    `;

    const { _max } = await tx.receipt.aggregate({
      where: { companyId },
      _max: { number: true },
    });

    return tx.receipt.create({
      data: { companyId, number: (_max.number ?? 0n) + 1n, ...(saleId ? { saleId } : {}) },
    });
  }

  /**
   * Dispara a geração do PDF sem que ninguém espere por ela.
   *
   * Sem `await` de propósito, e com o erro morrendo aqui dentro: quem chama é o
   * fluxo de saída, que já comitou. Deixar a promessa vazar viraria um
   * unhandled rejection derrubando o processo por causa de um arquivo.
   */
  schedulePdfGeneration(receiptId: string, companyId: string): void {
    void this.generateWithRetry(receiptId, companyId);
  }

  async findOne(id: string, companyId: string): Promise<ReceiptSummary> {
    const receipt = await this.prisma.db.receipt.findFirst({ where: { id, companyId } });

    if (!receipt) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Comprovante não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.toSummary(receipt);
  }

  /**
   * Regeneração explícita (aceite do épico): comprovante pendente por falha na
   * geração, ou arquivo perdido na troca de storage, volta a existir sem que a
   * movimentação precise ser refeita — e mantendo o mesmo número.
   *
   * Diferente da geração automática, esta **propaga** o erro: aqui existe alguém
   * esperando a resposta, e um 200 com o comprovante ainda pendente seria mentira.
   */
  async regenerate(
    id: string,
    companyId: string,
    actorId?: string,
    ip?: string,
  ): Promise<ReceiptSummary> {
    await this.findOne(id, companyId);

    const receipt = await this.generate(id, companyId).catch((error: unknown) => {
      this.logger.error({ err: error, receiptId: id }, 'Falha ao regenerar comprovante');

      throw new BusinessException(
        BusinessErrorCode.COMPROVANTE_NAO_GERADO,
        'Não foi possível gerar o PDF do comprovante. Tente novamente.',
      );
    });

    await this.audit.log({
      action: 'receipt.regenerated',
      resource: RECEIPTS_RESOURCE,
      userId: actorId,
      companyId,
      diff: { receiptId: id, number: receipt.number.toString() },
      ip,
    });

    return this.toSummary(receipt);
  }

  /**
   * Bytes do PDF para download.
   *
   * Gera na hora se o arquivo não existir — comprovante pendente (geração
   * falhada) ou arquivo sumido do disco. Quem pediu o comprovante quer o
   * comprovante, não um erro pedindo para clicar em "regenerar".
   */
  async getPdfFile(id: string, companyId: string): Promise<ReceiptPdfFile> {
    const summary = await this.findOne(id, companyId);
    const key = this.storage.buildKey(companyId, id);

    if (summary.pdfStatus !== 'READY' || !(await this.storage.exists(key))) {
      await this.generate(id, companyId).catch((error: unknown) => {
        this.logger.error({ err: error, receiptId: id }, 'Falha ao gerar comprovante sob demanda');

        throw new BusinessException(
          BusinessErrorCode.COMPROVANTE_NAO_GERADO,
          'Não foi possível gerar o PDF do comprovante. Tente novamente.',
        );
      });
    }

    return {
      content: await this.storage.read(key),
      filename: `comprovante-${summary.formattedNumber}.pdf`,
    };
  }

  /**
   * Uma tentativa: monta os dados, desenha o PDF, guarda e aponta o
   * `pdf_url` para a chave. Reexecutar é seguro — a chave é a mesma e o
   * conteúdo é derivado do banco.
   */
  private async generate(receiptId: string, companyId: string): Promise<Receipt> {
    const data = await this.loadPdfData(receiptId, companyId);
    const content = await this.pdf.render(data);
    const key = await this.storage.save(this.storage.buildKey(companyId, receiptId), content);

    return this.prisma.db.receipt.update({
      where: { id: receiptId, companyId },
      data: { pdfUrl: key },
    });
  }

  /**
   * Retry com backoff exponencial. Esgotadas as tentativas, o comprovante fica
   * **pendente** e o erro morre aqui: a movimentação está comitada, e nada do
   * que aconteça com o arquivo pode desfazê-la (docs/06).
   */
  private async generateWithRetry(receiptId: string, companyId: string): Promise<void> {
    const maxAttempts: number = this.config.get('RECEIPT_PDF_MAX_ATTEMPTS', { infer: true });
    const baseDelay: number = this.config.get('RECEIPT_PDF_RETRY_DELAY_MS', { infer: true });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.generate(receiptId, companyId);
        return;
      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;

        this.logger.warn(
          { err: error, receiptId, attempt, maxAttempts },
          'Falha ao gerar PDF do comprovante',
        );

        if (isLastAttempt) {
          this.logger.error(
            { receiptId, companyId },
            'Comprovante fica pendente após esgotar as tentativas; PDF continua regenerável',
          );
          return;
        }

        await this.delay(baseDelay * 2 ** (attempt - 1));
      }
    }
  }

  private async loadPdfData(receiptId: string, companyId: string): Promise<ReceiptPdfData> {
    const receipt = (await this.prisma.db.receipt.findFirst({
      where: { id: receiptId, companyId },
      include: {
        company: { select: { name: true, document: true } },
        stockMovement: {
          include: {
            user: { select: { email: true } },
            item: { select: { sku: true, name: true, unit: true, price: true } },
          },
        },
        sale: {
          include: {
            createdByUser: { select: { email: true } },
            customer: { select: { name: true, document: true, phone: true } },
            items: {
              select: {
                quantity: true,
                unitPrice: true,
                total: true,
                itemSkuSnapshot: true,
                itemNameSnapshot: true,
                item: { select: { unit: true } },
              },
            },
          },
        },
      },
    })) as ReceiptWithMovement | null;

    if (!receipt) {
      throw new BusinessException(
        BusinessErrorCode.RECURSO_NAO_ENCONTRADO,
        'Comprovante não encontrado',
        HttpStatus.NOT_FOUND,
      );
    }

    const padding: number = this.config.get('RECEIPT_NUMBER_PADDING', { infer: true });
    const base = {
      number: formatReceiptNumber(receipt.number, padding),
      issuedAt: receipt.createdAt,
      company: receipt.company,
    };

    if (receipt.sale) {
      const sale = receipt.sale;
      const salePadding: number = this.config.get('SALES_NUMBER_PADDING', { infer: true });

      // Quem calcula é sale-totals.ts (docs/33#decisões-que-valem-código):
      // o subtotal é a soma dos totais JÁ gravados em cada sale_item, não um
      // novo `unitPrice * quantity` recalculado aqui.
      const itemTotals = sale.items.map((item) => new Decimal(String(item.total)));
      const subtotal = calculateSaleTotal(itemTotals, new Decimal(0));
      const discount = new Decimal(String(sale.discount));
      const total = new Decimal(String(sale.total));
      const balance = calculateBalance(total, new Decimal(String(sale.paidAmount)));

      return {
        ...base,
        issuedBy: sale.createdByUser.email,
        sale: {
          number: formatSaleNumber(sale.number, salePadding),
          kind: sale.kind,
          paymentMethodLabel: sale.paymentMethod ? PAYMENT_METHOD_LABELS[sale.paymentMethod] : null,
          dueDate: sale.dueDate,
          subtotal: subtotal.toFixed(2),
          // `null` some o bloco inteiro no PDF — "Desconto: R$ 0,00" não
          // ajuda ninguém.
          discount: discount.gt(0) ? discount.toFixed(2) : null,
          total: total.toFixed(2),
          // Só faz sentido em venda a prazo (docs/33) — venda à vista nasce
          // com saldo zero por construção (docs/19).
          pendingAmount: sale.kind === SaleKind.CREDIT && balance.gt(0) ? balance.toFixed(2) : null,
          canceledAt: sale.canceledAt,
          customer: sale.customer,
        },
        lines: sale.items.map((item) => ({
          sku: item.itemSkuSnapshot,
          name: item.itemNameSnapshot,
          unit: item.item.unit,
          quantity: item.quantity,
          unitPrice: new Decimal(String(item.unitPrice)).toFixed(2),
          total: new Decimal(String(item.total)).toFixed(2),
        })),
      };
    }

    const movement = receipt.stockMovement;

    if (!movement) {
      // Não deveria acontecer: comprovante nasce junto da saída OU da venda.
      // Se acontecer, é dado inconsistente — e gerar um PDF sem itens seria
      // pior que falhar.
      throw new Error(`Comprovante ${receiptId} sem movimentação nem venda vinculada`);
    }

    const unitPrice = new Decimal(String(movement.item.price));

    return {
      ...base,
      issuedBy: movement.user.email,
      reason: movement.reason,
      lines: [
        {
          sku: movement.item.sku,
          name: movement.item.name,
          unit: movement.item.unit,
          quantity: movement.quantity,
          unitPrice: unitPrice.toFixed(2),
          // Mesma função pura da venda (docs/33): o PDF não calcula, nem
          // aqui nem lá.
          total: calculateItemTotal(unitPrice, movement.quantity).toFixed(2),
        },
      ],
    };
  }

  /**
   * `Pick` e não `Receipt` inteiro: o histórico de movimentações traz o
   * comprovante por join e seleciona só estas colunas. Exigir o registro
   * completo obrigaria aquela consulta a buscar campos que ninguém lê.
   */
  toSummary(receipt: Pick<Receipt, 'id' | 'number' | 'pdfUrl' | 'createdAt'>): ReceiptSummary {
    const padding: number = this.config.get('RECEIPT_NUMBER_PADDING', { infer: true });

    return {
      id: receipt.id,
      number: receipt.number.toString(),
      formattedNumber: formatReceiptNumber(receipt.number, padding),
      pdfStatus: receipt.pdfUrl ? 'READY' : 'PENDING',
      pdfUrl: receipt.pdfUrl,
      createdAt: receipt.createdAt,
    };
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      // Espera entre tentativas não pode segurar o encerramento do processo.
      timer.unref();
    });
  }
}
