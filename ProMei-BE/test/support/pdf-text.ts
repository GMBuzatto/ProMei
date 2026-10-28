/**
 * Extrai o texto visível de um PDF **sem compressão** (que é como o comprovante
 * é gerado — ver `ReceiptPdfService`).
 *
 * Existe porque o pdfkit escreve cada trecho como hex e ainda o quebra nos pares
 * de kerning: `Documento sem valor fiscal` vira
 * `[<446f...76> 20 <616c...6c> 0] TJ`. Procurar a string crua no buffer daria
 * falso negativo, e um teste que não consegue ler o próprio documento não
 * consegue cobrar o aviso obrigatório da RN-24.
 *
 * Cada operador de texto vira uma linha; os pedaços de um mesmo operador são
 * remontados sem separador, desfazendo o kerning.
 */
export function extractPdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const lines: string[] = [];

  for (const block of raw.matchAll(/\[((?:<[0-9A-Fa-f]*>\s*-?[\d.]*\s*)+)\]\s*TJ/g)) {
    const pieces = [...(block[1] ?? '').matchAll(/<([0-9A-Fa-f]*)>/g)].map((hex) =>
      Buffer.from(hex[1] ?? '', 'hex').toString('latin1'),
    );

    lines.push(pieces.join(''));
  }

  return lines.join('\n');
}
