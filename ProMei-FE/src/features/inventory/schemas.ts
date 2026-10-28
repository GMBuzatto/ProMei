import { z } from "zod";
import { STOCK_MOVEMENT_TYPES } from "./types";

/**
 * Schema da movimentação. Espelha `CreateStockMovementDto` (RF-32).
 *
 * Validar aqui é UX: a API revalida tudo, aplica o teto de quantidade e é ela quem decide se
 * o saldo comporta a saída (docs/09-seguranca.md).
 */
export const stockMovementSchema = z.object({
  itemId: z.uuid("Selecione o item da movimentação."),
  type: z.enum(STOCK_MOVEMENT_TYPES, { message: "Selecione o tipo de movimentação." }),
  /**
   * Quanto o saldo se move — não o saldo final. Zero é recusado pela API nos três tipos:
   * movimentação que não move nada é ruído no histórico.
   */
  quantity: z
    .number({ message: "Informe a quantidade." })
    .int("A quantidade deve ser um número inteiro.")
    .refine((value) => value !== 0, "A quantidade não pode ser zero."),
  /** RF-32 exige motivo em toda movimentação — inclusive na entrada e no ajuste. */
  reason: z
    .string()
    .trim()
    .min(1, "Informe o motivo da movimentação.")
    .max(500, "Máximo de 500 caracteres."),
});

export type StockMovementValues = z.infer<typeof stockMovementSchema>;
