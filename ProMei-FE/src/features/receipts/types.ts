/**
 * Espelho dos tipos da API para comprovantes de saída (ProMei-BE, módulo `receipts` — RF-33).
 *
 * Rota de tenant: comprovante pertence a uma empresa e a numeração é sequencial dentro dela
 * (RN-24). Não existe criação avulsa — comprovante nasce da saída de estoque.
 */

/** `PENDING` = número emitido, PDF ainda não gerado. O download funciona nos dois. */
export type ReceiptPdfStatus = "READY" | "PENDING";

export type ReceiptSummary = {
  id: string;
  /** Sequencial cru **como string**: é BIGINT na API e não sobrevive ao JSON como número. */
  number: string;
  /** O mesmo número como sai impresso, com o padding da RN-24 (ex.: `000412`). */
  formattedNumber: string;
  pdfStatus: ReceiptPdfStatus;
  pdfUrl: string | null;
  createdAt: string;
};
