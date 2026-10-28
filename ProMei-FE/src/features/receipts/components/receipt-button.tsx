"use client";

import { FileText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth/use-permissions";
import type { ReceiptSummary } from "../types";
import { ReceiptViewerDialog } from "./receipt-viewer-dialog";

/**
 * Número do comprovante de uma saída (RF-33). Clicar abre o visualizador, que traz o PDF na
 * tela e o download no rodapé.
 *
 * Sem `receipts:read` o número continua visível, só não vira botão — saber que a saída tem
 * comprovante nº 000412 já é informação de auditoria (RNF-06), e um botão que voltaria 403
 * não é.
 *
 * O visualizador só entra no DOM depois do primeiro clique: numa tabela de dez linhas, dez
 * diálogos montados de véspera seriam dez `<dialog>` para o navegador manter à toa.
 */
export function ReceiptButton({
  receipt,
}: {
  receipt: Pick<ReceiptSummary, "id" | "formattedNumber">;
}) {
  const canRead = usePermissions("receipts:read");
  const [open, setOpen] = useState(false);

  if (!canRead) {
    return (
      <span className="text-text-secondary font-mono text-xs">nº {receipt.formattedNumber}</span>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Ver o comprovante nº ${receipt.formattedNumber}`}
      >
        <FileText className="h-4 w-4" aria-hidden="true" />
        <span className="font-mono">nº {receipt.formattedNumber}</span>
      </Button>

      {open ? <ReceiptViewerDialog receipt={receipt} open onClose={() => setOpen(false)} /> : null}
    </>
  );
}
