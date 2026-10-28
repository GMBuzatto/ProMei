import { api } from "@/lib/api";
import type { Company, CompanyStatus, PaginatedResult, ProvisionedCompany } from "./types";
import type { CreateCompanyValues, UpdateCompanyValues } from "./schemas";

/**
 * Chamadas do módulo de empresas (`@PlatformRoute` na API: recurso de plataforma,
 * cross-tenant, exclusivo de Super Admin/Staff — RN-10).
 */

export type ListCompaniesParams = {
  page?: number;
  limit?: number;
};

/**
 * `GET /companies`.
 *
 * A API pagina, mas **não** aceita busca nem filtro (`ListCompaniesQueryDto` só tem
 * `page`/`limit`). Filtrar no cliente sobre a página corrente daria um resultado
 * enganoso — "nenhuma empresa" quando a empresa existe na página 3 —, então a tela
 * filtra apenas o que já está carregado e diz isso ao usuário.
 */
export function listCompanies(
  params: ListCompaniesParams = {},
  options: { signal?: AbortSignal } = {},
) {
  return api.get<PaginatedResult<Company>>("/companies", {
    query: { page: params.page, limit: params.limit },
    signal: options.signal,
  });
}

export function getCompany(id: string, options: { signal?: AbortSignal } = {}) {
  return api.get<Company>(`/companies/${id}`, { signal: options.signal });
}

/** `POST /companies` — provisiona empresa + admin inicial + papéis. */
export function createCompany(input: CreateCompanyValues) {
  return api.post<ProvisionedCompany>("/companies", input);
}

export function updateCompany(id: string, input: UpdateCompanyValues) {
  return api.patch<Company>(`/companies/${id}`, input);
}

/** `PATCH /companies/:id/status` — transições válidas em RN-11 (a API recusa as demais). */
export function updateCompanyStatus(id: string, status: CompanyStatus) {
  return api.patch<Company>(`/companies/${id}/status`, { status });
}
