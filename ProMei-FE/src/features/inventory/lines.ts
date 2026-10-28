import type { Item } from "@/features/items/types";
import { acceptsNegativeQuantity, exceedsAvailableStock } from "./movement";
import type { StockMovementType } from "./types";

/**
 * Linhas de uma movimentação com vários itens.
 *
 * **A API grava uma movimentação por requisição.** Não existe endpoint de lote: uma saída com
 * três itens são três `POST /stock-movements`, cada um com seu próprio saldo conferido pelo
 * banco e — no caso da saída — seu próprio comprovante (RF-33).
 *
 * A consequência que este módulo existe para tratar: o conjunto **não é atômico**. Se o
 * segundo item falhar, o primeiro já está gravado e o histórico é imutável (RN-22), então não
 * há como desfazer. Por isso a validação local é agressiva (barra antes de enviar tudo o que
 * dá para barrar) e o resultado é por linha, nunca um "deu certo" ou "deu errado" único.
 */

/**
 * Teto de itens por movimentação.
 *
 * Cada linha é uma requisição e a API limita 100 por minuto (`RATE_LIMIT_MAX`). O teto deixa
 * folga para o resto do painel e mantém o lote pequeno o bastante para uma falha parcial ser
 * compreensível — cem linhas com três erros no meio ninguém audita.
 */
export const MAX_MOVEMENT_LINES = 20;

export type MovementLine = {
  item: Item;
  /** Texto, como sai do input. A conversão acontece na validação. */
  quantity: string;
};

/** Quantidade digitada → inteiro. `null` quando não dá para ler um número inteiro. */
export function parseLineQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const amount = Number(trimmed);
  return Number.isInteger(amount) ? amount : null;
}

/**
 * Problema da linha, se houver.
 *
 * Devolve texto porque é isso que a tela mostra ao lado do item. Só cobre o que dá para saber
 * daqui: quantidade ilegível, zero, sinal errado e saldo insuficiente pelo estoque conhecido.
 * O saldo real continua sendo o do banco no momento da gravação (RN-21).
 */
export function lineError(line: MovementLine, type: StockMovementType): string | undefined {
  const quantity = parseLineQuantity(line.quantity);

  if (quantity === null) return "Informe um número inteiro.";
  if (quantity === 0) return "A quantidade não pode ser zero.";

  if (quantity < 0 && !acceptsNegativeQuantity(type)) {
    return "A quantidade deve ser positiva: a direção vem do tipo.";
  }

  if (exceedsAvailableStock(line.item.stock, type, quantity)) {
    return `Saldo insuficiente: ${line.item.stock} ${line.item.unit} disponíveis.`;
  }

  return undefined;
}

/** Erros por item, para a tela marcar cada linha em vez de dar um aviso genérico. */
export function collectLineErrors(
  lines: MovementLine[],
  type: StockMovementType,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const line of lines) {
    const error = lineError(line, type);
    if (error) errors[line.item.id] = error;
  }

  return errors;
}

/**
 * `true` quando o lote está pronto para ser enviado.
 *
 * Exige pelo menos uma linha e nenhuma linha com erro: como a gravação não é atômica, mandar
 * um lote sabidamente inválido gravaria as linhas boas antes de parar na ruim.
 */
export function canSubmitLines(lines: MovementLine[], type: StockMovementType): boolean {
  if (lines.length === 0) return false;
  return Object.keys(collectLineErrors(lines, type)).length === 0;
}
