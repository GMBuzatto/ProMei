import type { Company } from "@/features/companies/types";
import type { Subscription } from "@/features/subscriptions/types";

/**
 * Empresas que assinam um plano.
 *
 * **A API não responde essa pergunta.** Não existe `GET /subscriptions?planId=`, nem filtro
 * de plano em `GET /companies`: a única leitura de assinatura é `GET /subscriptions/:companyId`,
 * uma empresa por requisição. Então a resposta é montada aqui — varre as empresas e pergunta
 * a assinatura de cada uma.
 *
 * Isso tem um teto real: a API limita 100 requisições por minuto (`RATE_LIMIT_MAX`). Passar
 * disso não deixaria a tela mais completa, deixaria a sessão inteira tomando 429. Por isso a
 * varredura para em {@link MAX_COMPANIES_INSPECTED} e a tela **diz** que o resultado é
 * parcial, em vez de apresentar uma lista curta como se fosse a lista toda.
 *
 * A saída natural é um `GET /plans/:id/companies` (ou `GET /subscriptions?planId=`) no
 * back-end: uma query com `where: { planId }` resolve, e este módulo vira uma chamada só.
 */

/**
 * Teto de empresas consultadas numa visita.
 *
 * Deixa folga dentro do orçamento de 100 req/min para o resto do painel (a própria varredura
 * de empresas, navegação, refresh de token).
 */
export const MAX_COMPANIES_INSPECTED = 60;

/** Requisições simultâneas. Suficiente para a tela não parecer travada, longe de um flood. */
const CONCURRENCY = 6;

export type PlanSubscriber = {
  company: Company;
  subscription: Subscription;
};

export type PlanSubscribers = {
  /** Já ordenadas pela renovação mais próxima. */
  subscribers: PlanSubscriber[];
  /** Quantas empresas foram efetivamente consultadas. */
  inspected: number;
  /** Total de empresas na base — exato, vem da API. */
  total: number;
  /** `true` quando nem todas as empresas foram consultadas: pode haver mais assinantes. */
  partial: boolean;
  /** Empresas cuja assinatura não pôde ser lida (erro de rede, 403). */
  failed: number;
};

/**
 * Ordena pela próxima renovação, da mais próxima para a mais distante.
 *
 * A comparação é feita sobre a **string** `YYYY-MM-DD`, não sobre `Date`: `renewsAt` é
 * `@db.Date` serializado à meia-noite UTC, e converter para o fuso local voltaria um dia no
 * Brasil — o bastante para trocar a ordem de duas empresas que renovam em dias seguidos.
 *
 * Empate desempata por nome, para a lista não embaralhar a cada carregamento.
 */
export function sortByRenewal(subscribers: PlanSubscriber[]): PlanSubscriber[] {
  return [...subscribers].sort((left, right) => {
    const byDate = left.subscription.renewsAt
      .slice(0, 10)
      .localeCompare(right.subscription.renewsAt.slice(0, 10));

    if (byDate !== 0) return byDate;
    return left.company.name.localeCompare(right.company.name, "pt-BR");
  });
}

/** Só as empresas cuja assinatura aponta para este plano, já ordenadas. */
export function subscribersOfPlan(
  entries: { company: Company; subscription: Subscription | null }[],
  planId: string,
): PlanSubscriber[] {
  const matching = entries.filter(
    (entry): entry is PlanSubscriber =>
      entry.subscription !== null && entry.subscription.planId === planId,
  );

  return sortByRenewal(matching);
}

/** Executa em lotes para não disparar tudo de uma vez contra o rate limit da API. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];

  for (let start = 0; start < items.length; start += limit) {
    const batch = items.slice(start, start + limit);
    results.push(...(await Promise.all(batch.map(worker))));
  }

  return results;
}

export type PlanSubscribersLoaders = {
  loadDirectory: () => Promise<{ companies: Company[]; total: number; partial: boolean }>;
  loadSubscription: (companyId: string) => Promise<Subscription | null>;
};

/**
 * Monta a lista de assinantes do plano.
 *
 * Os carregadores são injetados para esta função não conhecer cache nem React — e para o
 * hook poder passar leitores que reaproveitam o que já está em cache (uma empresa aberta
 * antes não é consultada de novo).
 */
export async function fetchPlanSubscribers(
  planId: string,
  { loadDirectory, loadSubscription }: PlanSubscribersLoaders,
): Promise<PlanSubscribers> {
  const directory = await loadDirectory();
  const companies = directory.companies.slice(0, MAX_COMPANIES_INSPECTED);

  let failed = 0;

  const entries = await mapWithConcurrency(companies, CONCURRENCY, async (company) => {
    try {
      return { company, subscription: await loadSubscription(company.id) };
    } catch {
      // Uma empresa ilegível não pode derrubar a lista inteira: ela vira contagem,
      // e a tela avisa que o resultado pode estar incompleto.
      failed += 1;
      return { company, subscription: null };
    }
  });

  return {
    subscribers: subscribersOfPlan(entries, planId),
    inspected: companies.length,
    total: directory.total,
    partial: directory.partial || directory.companies.length > companies.length,
    failed,
  };
}
