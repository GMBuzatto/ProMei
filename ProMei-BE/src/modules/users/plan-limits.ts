/**
 * Limites do plano vivem em `Plan.limits` (JSONB) — ver seed:
 * `{ maxUsers, maxItems, maxCustomers }`.
 *
 * Ler com tolerância é proposital: plano sem o limite declarado significa "sem
 * teto", e não "zero". Um JSON malformado não pode virar bloqueio total de
 * cadastro para o cliente.
 *
 * `maxCustomers` é a exceção: docs/27/PD-08 define que a AUSÊNCIA dele no
 * plano cai no default de `PLAN_DEFAULT_MAX_CUSTOMERS` (env), não em "sem
 * teto" — diferente de `maxUsers`/`maxItems`. Por isso não é o chamador que
 * decide o fallback; `resolveMaxCustomers` já entrega o valor pronto para
 * `exceedsLimit`.
 */
export interface PlanLimits {
  maxUsers?: number;
  maxItems?: number;
  maxCustomers?: number;
}

export function parsePlanLimits(limits: unknown): PlanLimits {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) {
    return {};
  }

  const raw = limits as Record<string, unknown>;

  return {
    ...(typeof raw.maxUsers === 'number' ? { maxUsers: raw.maxUsers } : {}),
    ...(typeof raw.maxItems === 'number' ? { maxItems: raw.maxItems } : {}),
    ...(typeof raw.maxCustomers === 'number' ? { maxCustomers: raw.maxCustomers } : {}),
  };
}

/** RN-14/PD-08: `maxCustomers` ausente no plano usa o default de env, nunca "sem teto". */
export function resolveMaxCustomers(limits: PlanLimits, defaultMaxCustomers: number): number {
  return limits.maxCustomers ?? defaultMaxCustomers;
}

/** RN-14: exceder o limite bloqueia novos cadastros; não apaga o que existe. */
export function exceedsLimit(current: number, limit?: number): boolean {
  if (limit === undefined) return false;
  return current >= limit;
}
