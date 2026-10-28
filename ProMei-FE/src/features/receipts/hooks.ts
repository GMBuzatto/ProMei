"use client";

import { useQuery } from "@tanstack/react-query";
import { downloadReceiptPdf } from "./api";

/** Chaves do cache de comprovantes. */
export const receiptKeys = {
  all: ["receipts"] as const,
  pdf: (id: string) => [...receiptKeys.all, "pdf", id] as const,
};

/**
 * O PDF do comprovante para exibir na tela (RF-33).
 *
 * `enabled` porque quem chama é o visualizador: buscar o arquivo antes de alguém abrir o
 * diálogo baixaria um PDF por linha da tabela.
 *
 * O comprovante é imutável na prática — mesmo número, mesmo conteúdo — então o blob fica no
 * cache e reabrir o mesmo comprovante não gera requisição nova.
 */
export function useReceiptPdf(id: string, enabled: boolean) {
  return useQuery({
    queryKey: receiptKeys.pdf(id),
    queryFn: ({ signal }) => downloadReceiptPdf(id, { signal }),
    enabled: enabled && id.length > 0,
    staleTime: Infinity,
  });
}
