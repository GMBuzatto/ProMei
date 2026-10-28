"use client";

import { ArrowDownToLine, ArrowUpFromLine, Check, ShoppingCart, Scale } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ApiErrorAlert } from "@/components/api-error-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getItem } from "@/features/items/api";
import { itemKeys } from "@/features/items/hooks";
import type { Item } from "@/features/items/types";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import type { MovementBatchResult } from "../batch";
import { useRegisterMovementBatch } from "../hooks";
import { canSubmitLines, MAX_MOVEMENT_LINES, type MovementLine } from "../lines";
import { MOVEMENT_TYPE_META } from "../movement";
import { STOCK_MOVEMENT_TYPES, type StockMovementType } from "../types";
import { ItemPicker } from "./item-picker";
import { MovementLines } from "./movement-lines";
import { MovementResult } from "./movement-result";

const TYPE_ICON = {
  OUT: ArrowUpFromLine,
  IN: ArrowDownToLine,
  ADJUSTMENT: Scale,
} as const;

function isMovementType(value: string | null): value is StockMovementType {
  return value !== null && (STOCK_MOVEMENT_TYPES as readonly string[]).includes(value);
}

/**
 * Registro de movimentação de estoque (RF-32), com vários itens de uma vez.
 *
 * Desenhado para a saída caber em **três cliques a partir do dashboard** (RNF-11):
 *
 * 1. "Registrar saída" no dashboard — chega aqui com `?type=OUT` já escolhido;
 * 2. marcar o item na lista, que já vem carregada (marcar outros não custa passo novo);
 * 3. "Registrar saída".
 *
 * Quantidade nasce em 1 por item e o motivo vem sugerido pelo tipo, os dois editáveis: são os
 * campos que a API exige e que, em branco, custariam mais passos no caminho comum.
 *
 * **O lote não é atômico.** A API grava uma movimentação por requisição, e o histórico é
 * imutável (RN-22): se a terceira linha falhar, as duas primeiras já estão gravadas e não há
 * como desfazer. Por isso a tela barra localmente tudo o que consegue barrar antes de enviar
 * (saldo insuficiente conhecido, quantidade inválida) e, no fim, relata **item a item**.
 *
 * "Transferência", do mockup, não existe na API: há entrada, saída e ajuste, e o modelo não
 * tem locais de estoque.
 */
export function StockMovementForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const requestedType = searchParams.get("type");
  const [type, setType] = useState<StockMovementType>(
    isMovementType(requestedType) ? requestedType : "OUT",
  );
  const [lines, setLines] = useState<MovementLine[]>([]);
  const [reason, setReason] = useState(MOVEMENT_TYPE_META[type].defaultReason);
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [batch, setBatch] = useState<MovementBatchResult | null>(null);

  const register = useRegisterMovementBatch();
  const reasonId = useId();

  const meta = MOVEMENT_TYPE_META[type];
  const selectedIds = new Set(lines.map((line) => line.item.id));
  const atLimit = lines.length >= MAX_MOVEMENT_LINES;

  function changeType(next: StockMovementType) {
    setType(next);
    // O motivo acompanha o tipo enquanto ainda for o sugerido — texto escrito à mão nunca é
    // sobrescrito.
    setReason((current) =>
      current === MOVEMENT_TYPE_META[type].defaultReason
        ? MOVEMENT_TYPE_META[next].defaultReason
        : current,
    );
  }

  function toggleItem(item: Item, selected: boolean) {
    setLines((current) => {
      if (!selected) return current.filter((line) => line.item.id !== item.id);
      if (current.some((line) => line.item.id === item.id)) return current;
      if (current.length >= MAX_MOVEMENT_LINES) return current;
      return [...current, { item, quantity: "1" }];
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (register.isPending) return;

    if (reason.trim().length === 0) {
      setReasonError("Informe o motivo da movimentação.");
      return;
    }

    if (!canSubmitLines(lines, type)) return;

    setReasonError(undefined);
    register.mutate(
      { lines, type, reason: reason.trim() },
      { onSuccess: (result) => setBatch(result) },
    );
  }

  if (batch) {
    return (
      <MovementResult
        batch={batch}
        type={type}
        onRetryFailed={() => {
          // Só o que falhou volta ao formulário: repetir o lote inteiro gravaria de novo o
          // que já entrou, e movimentação não se desfaz.
          const failedLines = batch.failed.map((outcome) =>
            outcome.status === "error"
              ? { item: outcome.item, quantity: outcome.quantity }
              : { item: outcome.item, quantity: "1" },
          );

          setLines(failedLines);
          setBatch(null);
          register.reset();

          // O saldo em mãos é o de quando o item foi marcado — e a causa mais comum da falha
          // é justamente ele ter mudado. Sem recarregar, a validação local aprovaria de novo
          // a mesma quantidade e a API recusaria de novo.
          void Promise.all(
            failedLines.map(async (line) => {
              try {
                const fresh = await queryClient.fetchQuery({
                  queryKey: itemKeys.detail(line.item.id),
                  queryFn: ({ signal }) => getItem(line.item.id, { signal }),
                  staleTime: 0,
                });
                return { ...line, item: fresh };
              } catch {
                // Falhou recarregar: fica o saldo antigo, e quem decide continua sendo a API.
                return line;
              }
            }),
          ).then(setLines);
        }}
        onNew={() => {
          setLines([]);
          setReason(MOVEMENT_TYPE_META[type].defaultReason);
          setBatch(null);
          register.reset();
        }}
      />
    );
  }

  const ready = canSubmitLines(lines, type);

  return (
    <form noValidate onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-6">
          <fieldset disabled={register.isPending} className="min-w-0 space-y-6">
            <div className="space-y-2">
              <Label>Tipo de movimentação</Label>
              <div className="grid gap-3 sm:grid-cols-3">
                {STOCK_MOVEMENT_TYPES.map((option) => {
                  const optionMeta = MOVEMENT_TYPE_META[option];
                  const Icon = TYPE_ICON[option];
                  const isSelected = option === type;

                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => changeType(option)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                        "focus-visible:border-input-border-focus focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
                        "motion-reduce:transition-none",
                        isSelected
                          ? "border-border-brand bg-surface-selected"
                          : "border-border hover:bg-surface-hover",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 h-5 w-5 shrink-0",
                          isSelected ? "text-text-brand" : "text-text-tertiary",
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="text-foreground block text-sm font-medium">
                          {optionMeta.label}
                        </span>
                        <span className="text-text-secondary block text-xs leading-snug">
                          {optionMeta.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <ItemPicker selectedIds={selectedIds} onToggle={toggleItem} disabled={atLimit} />

            {atLimit ? (
              <p className="text-text-tertiary text-xs">
                Limite de {MAX_MOVEMENT_LINES} itens por movimentação: cada item é uma requisição, e
                lotes maiores esbarram no limite de vazão da API.
              </p>
            ) : null}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Itens da movimentação</Label>
                <span className="text-text-secondary inline-flex items-center gap-1.5 text-sm">
                  <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                  {lines.length === 1 ? "1 item selecionado" : `${lines.length} itens selecionados`}
                </span>
              </div>

              <MovementLines
                lines={lines}
                type={type}
                onChangeQuantity={(itemId, quantity) =>
                  setLines((current) =>
                    current.map((line) => (line.item.id === itemId ? { ...line, quantity } : line)),
                  )
                }
                onRemove={(itemId) =>
                  setLines((current) => current.filter((line) => line.item.id !== itemId))
                }
              />
            </div>

            <div className="space-y-2 sm:max-w-md">
              <Label htmlFor={reasonId}>
                Motivo <span className="text-text-danger">*</span>
              </Label>
              <Input
                id={reasonId}
                name="reason"
                placeholder={type === "ADJUSTMENT" ? "Ex: conferência física" : "Ex: venda"}
                value={reason}
                aria-invalid={reasonError ? true : undefined}
                onChange={(event) => {
                  setReason(event.target.value);
                  setReasonError(undefined);
                }}
              />
              {reasonError ? <p className="text-text-danger text-xs">{reasonError}</p> : null}
              <p className="text-text-tertiary text-xs">
                Vale para todos os itens desta movimentação e fica no histórico, junto de quem
                movimentou e quando.
              </p>
            </div>

            <ApiErrorAlert error={register.error} />
          </fieldset>
        </CardContent>

        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t p-5">
          <Link href="/items" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Ver catálogo
          </Link>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={register.isPending}
              onClick={() => router.push("/dashboard")}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              // Bloqueado só pelo que é certo: sem itens, ou com linha inválida. Como a
              // gravação não é atômica, enviar um lote sabidamente errado gravaria as linhas
              // boas antes de parar na ruim.
              disabled={!ready}
              loading={register.isPending}
              loadingText="Registrando..."
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {meta.action}
              {lines.length > 1 ? ` (${lines.length} itens)` : ""}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
