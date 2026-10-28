import { z } from "zod";

/**
 * Schemas dos payloads de assinatura. Espelham `ChangePlanDto` e `CreateSubscriptionDto`.
 *
 * Validar aqui é UX: a API revalida tudo e é ela quem decide (docs/09-seguranca.md).
 */

/** Troca de plano (`PATCH /subscriptions/:companyId/plan`). */
export const changePlanSchema = z.object({
  planId: z.uuid("Selecione um plano."),
});

export type ChangePlanValues = z.infer<typeof changePlanSchema>;

/**
 * Primeira assinatura (`POST /subscriptions`). `renewsAt` é obrigatório na API e vai como
 * `YYYY-MM-DD`: o DTO valida com `IsDateString` e a coluna é `@db.Date`, então mandar o
 * instante completo só arrastaria fuso para dentro do banco.
 *
 * `status` fica de fora de propósito — sem ele a assinatura nasce em trial (RN-12), e mudar
 * de estado é outro fluxo (`PATCH /subscriptions/:companyId/status`).
 */
export const createSubscriptionSchema = z.object({
  companyId: z.uuid(),
  planId: z.uuid("Selecione um plano."),
  renewsAt: z.iso.date("Informe a data da próxima renovação."),
});

export type CreateSubscriptionValues = z.infer<typeof createSubscriptionSchema>;
