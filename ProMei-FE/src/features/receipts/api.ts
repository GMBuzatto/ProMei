import { api } from "@/lib/api";
import type { ReceiptSummary } from "./types";

export function getReceipt(id: string) {
  return api.get<ReceiptSummary>(`/receipts/${id}`);
}

/**
 * `GET /receipts/:id/pdf` — o comprovante para imprimir ou guardar (RF-33).
 *
 * Devolve `Blob`, não JSON: a rota responde `application/pdf`. A API gera o arquivo na hora
 * se ainda estiver `PENDING`, então o download funciona mesmo logo depois da saída — não há
 * o que esperar na tela.
 *
 * Passa pelo client de sempre porque o PDF exige `Authorization`: um `<a href>` apontando
 * direto para a API sairia sem o token e voltaria 401.
 */
export function downloadReceiptPdf(id: string, options: { signal?: AbortSignal } = {}) {
  return api.get<Blob>(`/receipts/${id}/pdf`, {
    responseType: "blob",
    headers: { Accept: "application/pdf" },
    signal: options.signal,
  });
}
