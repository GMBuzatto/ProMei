import { API_MAX_PAGE_SIZE } from "@/lib/pagination";
import { listCompanies } from "./api";
import { normalizeDocument } from "./document";
import { COMPANY_STATUSES, type Company, type CompanyStatus } from "./types";

/**
 * Totais por estado das empresas.
 *
 * A API não tem endpoint de agregação: `GET /companies` devolve uma página e o total geral,
 * sem contagem por status e sem filtro. Então o painel varre as páginas e conta aqui.
 *
 * Isso é aceitável no volume do MVP (dezenas a centenas de empresas) e explicitamente
 * limitado: acima de `MAX_PAGES` o resultado é parcial e a interface diz isso, em vez de
 * mostrar um número redondo que estaria errado.
 *
 * A saída natural é um `GET /companies/stats` no back-end — uma única query com
 * `groupBy(status)` resolve, e este módulo vira uma chamada só.
 */

/** Teto do serviço (`PAGINATION_MAX_LIMIT`). Pedir mais não traz mais. */
const STATS_PAGE_SIZE = API_MAX_PAGE_SIZE;

/** Além disto, para de varrer: o custo deixa de valer o número exato. */
const MAX_PAGES = 20;

export type CompanyStats = {
  /** Total geral informado pela API — exato mesmo quando a varredura é parcial. */
  total: number;
  byStatus: Record<CompanyStatus, number>;
  /** Quantas empresas foram efetivamente contadas. */
  scanned: number;
  /** `true` quando a varredura parou antes do fim: as contagens por status são parciais. */
  partial: boolean;
};

function emptyCounts(): Record<CompanyStatus, number> {
  return { ACTIVE: 0, SUSPENDED: 0, CANCELED: 0 };
}

/** Parte pura: conta por status. Separada da busca para poder ser testada sozinha. */
export function summarizeCompanies(
  companies: Company[],
  total: number,
  partial = false,
): CompanyStats {
  const byStatus = emptyCounts();

  for (const company of companies) {
    // Status desconhecido (API novo, front antigo) não pode derrubar o painel nem
    // ser contado no balde errado — fica de fora, e o total geral continua honesto.
    if (COMPANY_STATUSES.includes(company.status)) {
      byStatus[company.status] += 1;
    }
  }

  return { total, byStatus, scanned: companies.length, partial };
}

export type CompanyDirectory = {
  companies: Company[];
  /** Total geral informado pela API — exato mesmo quando a varredura é parcial. */
  total: number;
  /** `true` quando a varredura parou antes do fim: a lista carregada não é completa. */
  partial: boolean;
};

/**
 * Varre as páginas e devolve as empresas carregadas.
 *
 * A primeira resposta já diz quantas páginas existem, e as demais vão em paralelo — em
 * série, 128 empresas custariam duas idas e voltas sequenciais sem motivo.
 *
 * Duas telas dependem disto pelo mesmo motivo — a API não filtra nem agrega: os totais por
 * status e a checagem de CNPJ repetido no cadastro. As duas passam pela mesma chave de
 * cache, então a varredura acontece uma vez só.
 */
export async function fetchCompanyDirectory(
  options: { signal?: AbortSignal } = {},
): Promise<CompanyDirectory> {
  const first = await listCompanies({ page: 1, limit: STATS_PAGE_SIZE }, options);

  // O serviço decide o limite efetivo (pode ser menor que o pedido) — a conta de páginas
  // precisa usar o que voltou, não o que foi pedido.
  const limit = first.limit > 0 ? first.limit : STATS_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(first.total / limit));
  const pagesToFetch = Math.min(totalPages, MAX_PAGES);

  const rest = await Promise.all(
    Array.from({ length: pagesToFetch - 1 }, (_, index) =>
      listCompanies({ page: index + 2, limit }, options),
    ),
  );

  return {
    companies: [first, ...rest].flatMap((page) => page.data),
    total: first.total,
    partial: totalPages > pagesToFetch,
  };
}

/**
 * Empresa que já usa este CNPJ, entre as que foram carregadas.
 *
 * Compara normalizado porque a máscara é só da tela: "11.222.333/0001-81" e
 * "11222333000181" são o mesmo documento.
 *
 * `undefined` significa "não encontrei", e **não** "está livre": numa varredura parcial a
 * empresa pode estar numa página que não foi lida. Por isso quem chama só usa o resultado
 * para acusar duplicidade, nunca para garantir disponibilidade.
 */
export function findCompanyByDocument(
  directory: CompanyDirectory,
  document: string,
): Company | undefined {
  const normalized = normalizeDocument(document);
  if (normalized.length === 0) return undefined;

  return directory.companies.find((company) => normalizeDocument(company.document) === normalized);
}
