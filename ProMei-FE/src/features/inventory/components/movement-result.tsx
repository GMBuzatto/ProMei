"use client";

import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReceiptButton } from "@/features/receipts/components/receipt-button";
import { getErrorMessage } from "@/lib/api";
import type { MovementBatchResult } from "../batch";
import { isInsufficientStockError } from "../errors";
import { MOVEMENT_TYPE_META } from "../movement";
import type { StockMovementType } from "../types";

/**
 * Resultado da movimentação, item a item.
 *
 * Como cada item é uma requisição e o histórico é imutável (RN-22), **sucesso parcial é um
 * desfecho real**: parte pode estar gravada e parte não. Esta tela nunca resume isso num
 * "deu certo" — separa o que entrou do que faltou, mostra o motivo de cada falha e oferece
 * repetir **só as linhas que falharam**, para ninguém duplicar o que já foi gravado.
 *
 * Os saldos exibidos são os que a API devolveu, não os que a tela calculou.
 */
export function MovementResult({
  batch,
  type,
  onRetryFailed,
  onNew,
}: {
  batch: MovementBatchResult;
  type: StockMovementType;
  onRetryFailed: () => void;
  onNew: () => void;
}) {
  const meta = MOVEMENT_TYPE_META[type];
  const hasFailures = batch.failed.length > 0;
  const receipts = batch.succeeded
    .map((outcome) => (outcome.status === "success" ? outcome.result.receipt : null))
    .filter((receipt) => receipt !== null);

  return (
    <Card>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            className={
              hasFailures
                ? "bg-status-warning-bg flex h-14 w-14 items-center justify-center rounded-full"
                : "bg-status-success-bg flex h-14 w-14 items-center justify-center rounded-full"
            }
          >
            {hasFailures ? (
              <AlertTriangle className="text-status-warning-icon h-7 w-7" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="text-status-success-icon h-7 w-7" aria-hidden="true" />
            )}
          </span>

          <div className="space-y-1">
            <h2 className="text-foreground text-lg font-semibold" role="status">
              {hasFailures
                ? `${batch.succeeded.length} de ${batch.outcomes.length} itens registrados`
                : `${meta.label} registrada`}
            </h2>
            <p className="text-text-secondary text-sm">
              {hasFailures
                ? "O que foi gravado não pode ser desfeito: movimentação é histórico. Corrija e repita apenas o que faltou."
                : `${batch.succeeded.length} ${batch.succeeded.length === 1 ? "item movimentado" : "itens movimentados"}.`}
            </p>
          </div>
        </div>

        {batch.succeeded.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-foreground text-sm font-semibold">Registrados</h3>
            <ul className="divide-border divide-y">
              {batch.succeeded.map((outcome) =>
                outcome.status === "success" ? (
                  <li
                    key={outcome.item.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <span className="text-foreground min-w-0 text-sm">
                      {outcome.item.name}
                      <span className="text-text-tertiary">
                        {" "}
                        · {outcome.result.movement.quantity}
                      </span>
                    </span>
                    <span className="text-text-secondary text-sm tabular-nums">
                      saldo: {outcome.result.item.stock}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          </section>
        ) : null}

        {hasFailures ? (
          <section className="border-status-danger-border bg-status-danger-bg space-y-2 rounded-lg border p-4">
            <h3 className="text-status-danger-text text-sm font-semibold">Não registrados</h3>
            <ul className="space-y-2">
              {batch.failed.map((outcome) =>
                outcome.status === "error" ? (
                  <li key={outcome.item.id} className="text-status-danger-text text-sm">
                    <span className="font-medium">
                      {outcome.item.name}
                      {isInsufficientStockError(outcome.error) ? " (saldo insuficiente)" : null}
                    </span>
                    {/* A mensagem da API traz SKU, disponível e solicitado no instante da
                        gravação: números que a tela não teria como saber sozinha. */}
                    <span className="block">{getErrorMessage(outcome.error)}</span>
                    {isInsufficientStockError(outcome.error) ? (
                      <span className="block text-xs">
                        O saldo mudou enquanto você preenchia. Ao corrigir, a quantidade disponível
                        é recarregada.
                      </span>
                    ) : null}
                  </li>
                ) : null,
              )}
            </ul>
          </section>
        ) : null}

        {receipts.length > 0 ? (
          <div className="border-border bg-surface-subtle flex flex-wrap items-start gap-3 rounded-lg border p-4">
            <FileText className="text-text-secondary mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-foreground text-sm font-medium">
                {receipts.length === 1
                  ? "Comprovante emitido"
                  : `${receipts.length} comprovantes emitidos`}
              </p>
              <p className="text-text-secondary text-sm">
                Cada saída gera o próprio comprovante (RF-33). O número já vale; o PDF é gerado na
                hora de abrir ou baixar, mesmo que a geração ainda esteja pendente.
              </p>

              <div className="flex flex-wrap gap-2">
                {receipts.map((receipt) => (
                  <ReceiptButton key={receipt.id} receipt={receipt} />
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>

      <div className="border-border flex flex-wrap items-center justify-end gap-3 border-t p-5">
        <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>
          Voltar ao dashboard
        </Link>

        {hasFailures ? (
          <Button type="button" onClick={onRetryFailed}>
            Corrigir os que faltaram
          </Button>
        ) : (
          <Button type="button" onClick={onNew}>
            Nova movimentação
          </Button>
        )}
      </div>
    </Card>
  );
}
