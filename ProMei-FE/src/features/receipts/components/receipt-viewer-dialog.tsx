"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { receiptFileName, saveBlob } from "../download";
import { useReceiptPdf } from "../hooks";
import type { ReceiptSummary } from "../types";

/**
 * Visualizador do comprovante de saída (RF-33): o PDF na tela, com download ao lado.
 *
 * O arquivo é buscado como blob porque a rota exige `Authorization` — apontar o `<iframe>`
 * direto para a API mandaria uma requisição sem token e mostraria um 401 dentro do quadro.
 * O object URL existe só enquanto o diálogo está aberto; a revogação no cleanup é o que
 * impede o blob de ficar preso na memória a cada comprovante aberto.
 *
 * O botão de download reaproveita o blob já carregado: baixar não custa uma segunda
 * requisição, e o arquivo salvo é exatamente o que está à vista.
 */
export function ReceiptViewerDialog({
  receipt,
  open,
  onClose,
}: {
  receipt: Pick<ReceiptSummary, "id" | "formattedNumber">;
  open: boolean;
  onClose: () => void;
}) {
  const { data: blob, isPending, error } = useReceiptPdf(receipt.id, open);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob || !open) {
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(blob);
    setObjectUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [blob, open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Comprovante nº ${receipt.formattedNumber}`}
      description="Comprovante de saída de estoque."
      className="w-[min(56rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button disabled={!blob} onClick={() => blob && saveBlob(blob, receiptFileName(receipt))}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Baixar PDF
          </Button>
        </>
      }
    >
      {error ? <ApiErrorAlert error={error} /> : null}

      {!error && isPending ? (
        <div
          role="status"
          aria-busy="true"
          className="border-border bg-background-subtle h-[70vh] animate-pulse rounded-md border motion-reduce:animate-none"
        >
          <span className="sr-only">Carregando o comprovante...</span>
        </div>
      ) : null}

      {objectUrl ? (
        <iframe
          src={objectUrl}
          title={`Comprovante nº ${receipt.formattedNumber}`}
          className="border-border h-[70vh] w-full rounded-md border"
        >
          {/* Navegador sem leitor de PDF embutido (o caso comum no celular) não fica sem
              saída: o botão do rodapé continua entregando o arquivo. */}
          <p className="text-text-secondary text-sm">
            Seu navegador não exibe PDF nesta janela. Use “Baixar PDF” para abrir o arquivo.
          </p>
        </iframe>
      ) : null}
    </Dialog>
  );
}
