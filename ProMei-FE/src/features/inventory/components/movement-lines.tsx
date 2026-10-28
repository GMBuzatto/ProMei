"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { collectLineErrors, parseLineQuantity, type MovementLine } from "../lines";
import { acceptsNegativeQuantity, projectedStock } from "../movement";
import type { StockMovementType } from "../types";

/**
 * Itens escolhidos, com a quantidade de cada um.
 *
 * Cada linha vira uma requisição e tem seu próprio saldo conferido pelo banco — por isso o
 * erro também é por linha, e não um aviso único no rodapé: quando uma saída não cabe, quem
 * preenche precisa saber **qual** item não cabe.
 */
export function MovementLines({
  lines,
  type,
  onChangeQuantity,
  onRemove,
}: {
  lines: MovementLine[];
  type: StockMovementType;
  onChangeQuantity: (itemId: string, quantity: string) => void;
  onRemove: (itemId: string) => void;
}) {
  const errors = collectLineErrors(lines, type);

  if (lines.length === 0) {
    return (
      <p className="border-border text-text-secondary rounded-lg border border-dashed p-6 text-center text-sm">
        Marque acima os itens desta movimentação.
      </p>
    );
  }

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <table className="w-full min-w-[36rem] border-collapse text-left">
        <thead>
          <tr className="border-border bg-surface-subtle border-b">
            <Th>Item</Th>
            <Th>Estoque atual</Th>
            <Th>Quantidade</Th>
            <Th className="pr-7 text-right">Ações</Th>
          </tr>
        </thead>

        <tbody>
          {lines.map((line) => {
            const error = errors[line.item.id];
            const quantity = parseLineQuantity(line.quantity);

            function step(by: number) {
              const base = quantity ?? 0;
              const next = base + by;
              if (!acceptsNegativeQuantity(type) && next < 1) return;
              onChangeQuantity(line.item.id, String(next));
            }

            return (
              <tr
                key={line.item.id}
                className={cn(
                  "border-border border-b last:border-b-0",
                  error && "bg-status-danger-bg/40",
                )}
              >
                <Td>
                  <p className="text-foreground text-sm font-medium">{line.item.name}</p>
                  <p className="text-text-tertiary font-mono text-xs">SKU {line.item.sku}</p>
                </Td>

                <Td>
                  <span className="text-text-secondary text-sm tabular-nums">
                    {line.item.stock} {line.item.unit}
                  </span>
                </Td>

                <Td>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label={`Diminuir quantidade de ${line.item.name}`}
                      onClick={() => step(-1)}
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </Button>

                    <Input
                      inputMode="numeric"
                      className="w-20 text-center tabular-nums"
                      value={line.quantity}
                      aria-label={`Quantidade de ${line.item.name}`}
                      aria-invalid={error ? true : undefined}
                      onChange={(event) => onChangeQuantity(line.item.id, event.target.value)}
                    />

                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label={`Aumentar quantidade de ${line.item.name}`}
                      onClick={() => step(1)}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>

                  {error ? (
                    <p className="text-text-danger mt-1 text-xs">{error}</p>
                  ) : quantity !== null ? (
                    <p className="text-text-tertiary mt-1 text-xs">
                      Saldo depois: {projectedStock(line.item.stock, type, quantity)}{" "}
                      {line.item.unit}
                    </p>
                  ) : null}
                </Td>

                <Td className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-status-danger-text hover:bg-status-danger-bg"
                    aria-label={`Remover ${line.item.name} da movimentação`}
                    onClick={() => onRemove(line.item.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remover
                  </Button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "text-text-secondary px-4 py-2 text-xs font-medium tracking-wide uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-top text-sm", className)}>{children}</td>;
}
