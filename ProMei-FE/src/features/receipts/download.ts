import type { ReceiptSummary } from "./types";

/**
 * Entrega um arquivo já baixado ao usuário.
 *
 * O PDF chega como `Blob` porque a rota exige `Authorization` (ver `downloadReceiptPdf`), e
 * um blob não tem endereço navegável: o object URL é o que dá um a ele, e a âncora sintética
 * é o que faz o browser tratar aquilo como download em vez de navegação.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Revogar no mesmo tick cancelaria o download que acabou de começar em alguns browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nome do arquivo salvo. Usa o número impresso (RN-24), que é como o MEI procura depois. */
export function receiptFileName(receipt: Pick<ReceiptSummary, "formattedNumber">): string {
  return `comprovante-${receipt.formattedNumber}.pdf`;
}
