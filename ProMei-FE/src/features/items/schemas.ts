import { z } from "zod";
import { parseMoneyInput } from "@/lib/money";

/**
 * Schema do formulário de item. Espelha `CreateItemDto`/`UpdateItemDto` da API.
 *
 * Validar aqui é UX: a API revalida tudo e é ela quem decide (docs/09-seguranca.md).
 */

/** Teto do `Decimal(10,2)` da coluna `price`. */
const MAX_PRICE = 99_999_999.99;

const priceSchema = z
  .string()
  .trim()
  .min(1, "Informe o preço.")
  .transform((value, ctx) => {
    const amount = parseMoneyInput(value);

    if (amount === null) {
      ctx.addIssue({
        code: "custom",
        message: "Preço inválido. Use no máximo duas casas decimais (ex.: 12,90).",
      });
      return z.NEVER;
    }

    if (amount > MAX_PRICE) {
      ctx.addIssue({ code: "custom", message: "Preço acima do máximo permitido." });
      return z.NEVER;
    }

    return amount;
  });

/**
 * Estoque mínimo (RF-35). Opcional: sem valor, a API assume `0` e o alerta fica desligado.
 * Zero é resposta válida — "não quero alerta" —, então o campo vazio vira `undefined`, e não
 * um erro.
 */
const minStockSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value.length === 0) return undefined;

    const amount = Number(value);

    if (!Number.isInteger(amount) || amount < 0) {
      ctx.addIssue({
        code: "custom",
        message: "O estoque mínimo deve ser um número inteiro igual ou maior que zero.",
      });
      return z.NEVER;
    }

    return amount;
  });

/** Campo de texto que a API aceita ausente, mas nunca vazio (`MinLength(1)` no DTO). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .transform((value) => (value.length === 0 ? undefined : value));

/**
 * `stock` não aparece aqui de propósito: saldo só muda por movimentação (RF-32/RN-22), e a
 * própria API recusa o campo. Um input de estoque nesta tela criaria saldo sem lastro no
 * histórico — exatamente o que a RN-22 impede.
 */
export const itemSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do item.").max(255, "Máximo de 255 caracteres."),
  unit: z.string().trim().min(1, "Informe a unidade (ex.: un, kg, cx)."),
  price: priceSchema,
  /** Sem SKU, a API gera um (RN-25). */
  sku: optionalText(64),
  category: optionalText(120),
  description: optionalText(1000),
  minStock: minStockSchema,
});

/** O que vai para a API — preço e estoque mínimo já convertidos para número. */
export type ItemValues = z.infer<typeof itemSchema>;

/** O que o formulário mantém em estado: tudo texto, como sai dos inputs. */
export type ItemFormValues = {
  name: string;
  unit: string;
  price: string;
  sku: string;
  category: string;
  description: string;
  minStock: string;
};

export type ItemFormErrors = Partial<Record<keyof ItemFormValues, string>>;

/**
 * Quantidade inicial em estoque, no cadastro do item.
 *
 * **Não faz parte do payload do item.** A API não aceita `stock` no cadastro porque saldo sem
 * movimentação é saldo sem lastro no histórico (RN-22). O formulário usa este valor para
 * registrar uma **entrada** logo depois de criar o item: o saldo nasce com origem, autor e
 * data — que é o que a RF-32 exige.
 *
 * Vazio é resposta válida ("começa zerado"), então vira `undefined` em vez de erro. Zero é
 * recusado porque a API recusa movimentação que não move nada.
 */
export const initialStockSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value.length === 0) return undefined;

    const amount = Number(value);

    if (!Number.isInteger(amount) || amount < 1) {
      ctx.addIssue({
        code: "custom",
        message: "A quantidade inicial deve ser um número inteiro a partir de 1.",
      });
      return z.NEVER;
    }

    return amount;
  });
