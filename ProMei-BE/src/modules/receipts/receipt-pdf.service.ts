import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { RECEIPT_NO_FISCAL_VALUE_NOTICE } from './receipt-number';

/** Uma linha do comprovante (RF-33). `total` já vem pronto — o PDF não calcula. */
export interface ReceiptLine {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: string;
  total: string;
}

/** Bloco presente só na variante "COMPROVANTE DE VENDA" (docs/33). */
export interface ReceiptSaleData {
  /** Número da VENDA, já com padding — distinto do número do comprovante. */
  number: string;
  kind: 'CASH' | 'CREDIT';
  /** Já traduzido para pt-BR ("PIX", "Dinheiro"...). `null` só é teoricamente possível. */
  paymentMethodLabel: string | null;
  dueDate: Date | null;
  /** Strings formatadas em BRL (`Prisma.Decimal` já resolvido por `sale-totals.ts`). */
  subtotal: string;
  /** `null` quando não há desconto — o bloco inteiro some, não mostra "R$ 0,00". */
  discount: string | null;
  total: string;
  /** `null` em venda à vista (saldo zero não é "pendência"). */
  pendingAmount: string | null;
  /** Preenchido → marca d'água CANCELADA (docs/26#comprovante). */
  canceledAt: Date | null;
  customer: { name: string; document: string | null; phone: string | null } | null;
}

export interface ReceiptPdfData {
  /** Já formatado com o padding — o PDF não decide como o número se apresenta. */
  number: string;
  issuedAt: Date;
  company: { name: string; document: string };
  /** Quem emitiu (RF-32 exige "quem"; o comprovante mostra). */
  issuedBy: string;
  /** Presente só na variante de venda; mutuamente exclusivo com `reason`. */
  sale?: ReceiptSaleData;
  /** Movimentação manual (MVP). Mutuamente exclusivo com `sale`. */
  reason?: string | null;
  lines: ReceiptLine[];
}

const PAGE_MARGIN = 50;

/** Colunas da tabela de itens, em pontos a partir da margem esquerda. */
const COLUMN = { item: 0, quantity: 250, unitPrice: 330, total: 430 };

/** `value` já é string formatada em 2 casas ("25.00") — só troca o separador. */
function formatBrl(value: string): string {
  return `R$ ${value.replace('.', ',')}`;
}

function formatDateTime(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, '0');

  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function formatDate(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear())}`;
}

/**
 * Desenha o comprovante (RF-33, docs/33) — a "nota fria" do MEI. Um único
 * renderizador para as duas variantes ("COMPROVANTE DE SAÍDA" e
 * "COMPROVANTE DE VENDA"): são o mesmo documento para quem recebe, e
 * duplicar significaria corrigir o aviso da RN-24 em dois lugares.
 *
 * O serviço só desenha — quem calcula é `sale-totals.ts` (docs/33#decisões-que-valem-código):
 * todo valor que chega aqui já é `Prisma.Decimal` resolvido e formatado.
 */
@Injectable()
export class ReceiptPdfService {
  async render(data: ReceiptPdfData): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      // Sem compressão de propósito: o comprovante tem uma página (ou
      // poucas), o ganho seria irrelevante, e o conteúdo em texto puro
      // permite conferir o documento (inclusive o aviso da RN-24) sem abrir
      // um leitor de PDF.
      compress: false,
      info: {
        Title: `Comprovante ${data.sale ? 'de venda' : 'de saída'} ${data.number}`,
        Author: data.company.name,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    // Rodapé (RN-24) e marca d'água de cancelamento são decoração DE PÁGINA,
    // não de fluxo: com N itens o PDFKit quebra sozinho, e sem redesenhar a
    // cada página o aviso obrigatório some das páginas seguintes — o
    // cenário exato de uma venda grande (docs/33#paginação).
    // `pageAdded` cobre a 2ª página em diante; a 1ª (criada no construtor)
    // precisa da chamada manual abaixo.
    const decoratePage = (): void => {
      this.withPreservedCursor(doc, () => {
        if (data.sale?.canceledAt) this.drawCanceledWatermark(doc);
        this.drawFooter(doc);
      });
    };

    doc.on('pageAdded', decoratePage);
    decoratePage();

    this.drawHeader(doc, data);
    this.drawLines(doc, data.lines);
    this.drawSummary(doc, data);

    doc.end();

    return finished;
  }

  private drawHeader(doc: PDFKit.PDFDocument, data: ReceiptPdfData): void {
    const title = data.sale ? 'COMPROVANTE DE VENDA' : 'COMPROVANTE DE SAÍDA';

    doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica-Bold').text(data.company.name, { align: 'center' });
    doc.fontSize(9).font('Helvetica').text(`CNPJ/CPF: ${data.company.document}`, {
      align: 'center',
    });

    doc.moveDown(1.5);

    if (data.sale) {
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(`Venda nº ${data.sale.number}`, { continued: true })
        .font('Helvetica')
        .text(`     Emitido em: ${formatDateTime(data.issuedAt)}`);
      doc.font('Helvetica-Bold').text(`Comprovante nº ${data.number}`);
    } else {
      doc.fontSize(10).font('Helvetica-Bold').text(`Comprovante nº ${data.number}`);
      doc.font('Helvetica').text(`Emitido em: ${formatDateTime(data.issuedAt)}`);
    }

    doc.font('Helvetica').text(`Responsável: ${data.issuedBy}`);

    this.drawCustomerBlock(doc, data.sale);

    doc.moveDown(1);
  }

  /**
   * Bloco condicional (docs/33): venda de balcão sem cliente OMITE o bloco
   * inteiro, não imprime "não identificado". Documento e telefone só
   * aparecem quando o cadastro os tem preenchidos.
   */
  private drawCustomerBlock(doc: PDFKit.PDFDocument, sale?: ReceiptSaleData): void {
    if (!sale?.customer) return;

    doc.moveDown(0.8);
    doc.fontSize(10).font('Helvetica-Bold').text('CLIENTE');
    doc.fontSize(9).font('Helvetica');

    const identity = sale.customer.document
      ? `${sale.customer.name} · CPF/CNPJ ${sale.customer.document}`
      : sale.customer.name;
    doc.text(identity);

    if (sale.customer.phone) doc.text(sale.customer.phone);
  }

  private drawLines(doc: PDFKit.PDFDocument, lines: ReceiptLine[]): void {
    const left = doc.page.margins.left;
    const headerY = doc.y;

    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('ITEM', left + COLUMN.item, headerY);
    doc.text('QTD', left + COLUMN.quantity, headerY);
    doc.text('VALOR UNIT.', left + COLUMN.unitPrice, headerY);
    doc.text('TOTAL', left + COLUMN.total, headerY);

    doc.moveDown(0.3);
    this.drawSeparator(doc);

    doc.font('Helvetica');

    for (const line of lines) {
      const rowY = doc.y;

      doc.text(`${line.sku} - ${line.name}`, left + COLUMN.item, rowY, {
        width: COLUMN.quantity - 10,
      });
      doc.text(`${String(line.quantity)} ${line.unit}`, left + COLUMN.quantity, rowY);
      doc.text(formatBrl(line.unitPrice), left + COLUMN.unitPrice, rowY);
      doc.text(formatBrl(line.total), left + COLUMN.total, rowY);

      doc.moveDown(0.5);
    }

    this.drawSeparator(doc);
  }

  private drawSummary(doc: PDFKit.PDFDocument, data: ReceiptPdfData): void {
    const left = doc.page.margins.left;
    doc.moveDown(0.5);

    if (data.sale) {
      doc.fontSize(9).font('Helvetica');
      doc.text(`Subtotal: ${formatBrl(data.sale.subtotal)}`, left + COLUMN.unitPrice, doc.y);

      if (data.sale.discount) {
        doc.text(`Desconto: ${formatBrl(data.sale.discount)}`, left + COLUMN.unitPrice, doc.y);
      }

      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica-Bold');
      doc.text(`TOTAL: ${formatBrl(data.sale.total)}`, left + COLUMN.unitPrice, doc.y);

      // docs/26#comprovante: comprovante não é apagado nem reemitido — a
      // regeneração de uma venda CANCELED sempre traz esta linha, senão um
      // PDF antigo circula como se a venda ainda valesse.
      if (data.sale.canceledAt) {
        doc.moveDown(0.3);
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(`Cancelada em: ${formatDateTime(data.sale.canceledAt)}`, left, doc.y);
      }
    } else {
      doc.fontSize(11).font('Helvetica-Bold');
      doc.text(`TOTAL: ${formatBrl(data.lines[0]!.total)}`, left + COLUMN.unitPrice, doc.y);
    }

    doc.moveDown(1.5);
    doc.fontSize(9).font('Helvetica');

    if (data.sale) {
      this.drawPaymentBlock(doc, data.sale);
    } else {
      doc.text(`Motivo: ${data.reason ?? '-'}`, left, doc.y);
    }
  }

  /** À vista fecha PAGO por construção (docs/19: nasce PAID); a prazo mostra vencimento e saldo. */
  private drawPaymentBlock(doc: PDFKit.PDFDocument, sale: ReceiptSaleData): void {
    const left = doc.page.margins.left;

    doc.fontSize(10).font('Helvetica-Bold').text('PAGAMENTO');
    doc.fontSize(9).font('Helvetica');

    if (sale.kind === 'CASH') {
      doc.text(`À vista · ${sale.paymentMethodLabel ?? '-'} · PAGO`, left, doc.y);
      return;
    }

    doc.text(`A prazo · Vencimento: ${sale.dueDate ? formatDate(sale.dueDate) : '-'}`, left, doc.y);
    if (sale.pendingAmount) {
      doc.text(`Valor pendente: ${formatBrl(sale.pendingAmount)}`, left, doc.y);
    }
  }

  /**
   * RN-24: o aviso é obrigatório e vai no rodapé, ancorado no pé da PÁGINA
   * ATUAL — desenhado uma vez por página (ver `decoratePage` em `render`),
   * não uma vez no fim do documento.
   */
  private drawFooter(doc: PDFKit.PDFDocument): void {
    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const base = doc.page.height - doc.page.margins.bottom - 40;

    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(RECEIPT_NO_FISCAL_VALUE_NOTICE, left, base, { width, align: 'center' });

    doc
      .fontSize(8)
      .font('Helvetica')
      .text('Emitido pelo ProMei. Controle interno de estoque.', left, base + 16, {
        width,
        align: 'center',
      });
  }

  /**
   * docs/26#comprovante, docs/33: venda cancelada imprime com a palavra
   * CANCELADA em diagonal, cinza claro, atrás do conteúdo — desenhada ANTES
   * do resto da página (ver `decoratePage`), então o texto real fica por
   * cima.
   */
  private drawCanceledWatermark(doc: PDFKit.PDFDocument): void {
    doc.save();
    doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc
      .fontSize(90)
      .font('Helvetica-Bold')
      .fillColor('#CCCCCC', 0.6)
      .text('CANCELADA', 0, doc.page.height / 2 - 45, {
        width: doc.page.width,
        align: 'center',
      });
    doc.restore();
  }

  private drawSeparator(doc: PDFKit.PDFDocument): void {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    doc
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .strokeColor('#999999')
      .lineWidth(0.5)
      .stroke()
      .strokeColor('#000000');

    doc.moveDown(0.5);
  }

  /**
   * `doc.x`/`doc.y` não fazem parte da pilha gráfica de `save()`/`restore()`
   * — só cor, transformação e opacidade. Decoração de página (rodapé, marca
   * d'água) precisa desenhar fora do fluxo do cursor de texto sem
   * atrapalhar o que vem a seguir (cabeçalho na página 1, continuação da
   * tabela nas seguintes).
   */
  private withPreservedCursor(doc: PDFKit.PDFDocument, draw: () => void): void {
    const { x, y } = doc;
    draw();
    doc.x = x;
    doc.y = y;
  }
}
