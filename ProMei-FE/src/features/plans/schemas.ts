import { z } from "zod";
import { parseMoneyInput } from "@/lib/money";
import { PLAN_PERIODS } from "./types";

/**
 * Schema do formulário de plano. Espelha `CreatePlanDto`/`UpdatePlanDto` da API.
 *
 * Validar aqui é UX: a API revalida tudo e é ela quem decide (docs/09-seguranca.md).
 */

/**
 * Preço: o campo é texto (a pessoa digita "149,90"), a API quer número com no máximo duas
 * casas. A conversão mora no schema para o componente nunca mandar `NaN` adiante.
 */
const priceSchema = z
  .string()
  .trim()
  .min(1, "Informe o preço.")
  .transform((value, ctx) => {
    const amount = parseMoneyInput(value);

    if (amount === null) {
      ctx.addIssue({
        code: "custom",
        message: "Preço inválido. Use no máximo duas casas decimais (ex.: 149,90).",
      });
      return z.NEVER;
    }

    return amount;
  });

/**
 * Limites do plano (RN-14). A API exige inteiro `>= 1`: plano com zero usuários não deixaria
 * ninguém entrar na empresa que o assinasse.
 */
const limitSchema = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Informe o ${label}.`)
    .transform((value, ctx) => {
      const amount = Number(value);

      if (!Number.isInteger(amount) || amount < 1) {
        ctx.addIssue({
          code: "custom",
          message: `O ${label} deve ser um número inteiro a partir de 1.`,
        });
        return z.NEVER;
      }

      return amount;
    });

export const planSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do plano.").max(255, "Máximo de 255 caracteres."),
  price: priceSchema,
  period: z.enum(PLAN_PERIODS, { message: "Selecione a periodicidade da cobrança." }),
  limits: z.object({
    maxUsers: limitSchema("limite de usuários"),
    maxItems: limitSchema("limite de itens"),
  }),
});

/** O que vai para a API — já com preço e limites convertidos para número. */
export type PlanValues = z.infer<typeof planSchema>;

/** O que o formulário mantém em estado: tudo texto, como sai dos inputs. */
export type PlanFormValues = {
  name: string;
  price: string;
  period: string;
  maxUsers: string;
  maxItems: string;
};

export type PlanFormErrors = Partial<Record<keyof PlanFormValues, string>>;
