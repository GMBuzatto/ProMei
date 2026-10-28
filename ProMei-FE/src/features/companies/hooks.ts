"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePermissions } from "@/features/auth/use-permissions";
import {
  createCompany,
  getCompany,
  listCompanies,
  updateCompany,
  updateCompanyStatus,
  type ListCompaniesParams,
} from "./api";
import { normalizeDocument, shouldCheckDocumentAvailability } from "./document";
import { fetchCompanyDirectory, findCompanyByDocument, summarizeCompanies } from "./stats";
import type { CompanyStatus } from "./types";
import type { UpdateCompanyValues } from "./schemas";

/** Chaves do cache. Centralizadas para invalidação não depender de string solta. */
export const companyKeys = {
  all: ["companies"] as const,
  list: (params: ListCompaniesParams) => [...companyKeys.all, "list", params] as const,
  detail: (id: string) => [...companyKeys.all, "detail", id] as const,
  /** Varredura das páginas: uma só, consumida pelos totais e pela checagem de CNPJ. */
  directory: () => [...companyKeys.all, "directory"] as const,
};

/** `keepPreviousData` para trocar de página sem piscar o esqueleto — como em itens. */
export function useCompanies(params: ListCompaniesParams = {}) {
  return useQuery({
    queryKey: companyKeys.list(params),
    queryFn: ({ signal }) => listCompanies(params, { signal }),
    placeholderData: keepPreviousData,
  });
}

/** Quanto tempo a varredura fica válida antes de ser refeita. */
export const DIRECTORY_STALE_TIME_MS = 60_000;

/**
 * Varredura das empresas. É mais cara que a listagem paginada (ver `stats.ts`), então tem
 * `staleTime` próprio: quem abre a lista e vai criar uma empresa não paga a varredura duas
 * vezes.
 */
export function useCompanyDirectory({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: companyKeys.directory(),
    queryFn: ({ signal }) => fetchCompanyDirectory({ signal }),
    staleTime: DIRECTORY_STALE_TIME_MS,
    enabled,
  });
}

/**
 * Totais por estado. Mesma chave e mesma função da varredura — só a leitura muda, então os
 * dois consumidores dividem uma requisição em vez de varrerem as páginas cada um.
 */
export function useCompanyStats() {
  return useQuery({
    queryKey: companyKeys.directory(),
    queryFn: ({ signal }) => fetchCompanyDirectory({ signal }),
    staleTime: DIRECTORY_STALE_TIME_MS,
    select: (directory) =>
      summarizeCompanies(directory.companies, directory.total, directory.partial),
  });
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: companyKeys.detail(id),
    queryFn: ({ signal }) => getCompany(id, { signal }),
    enabled: id.length > 0,
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCompany,
    onSuccess: () => {
      // A listagem ganhou uma linha e os totais mudaram.
      void queryClient.invalidateQueries({ queryKey: companyKeys.all });
    },
  });
}

export function useUpdateCompany(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: UpdateCompanyValues) => updateCompany(id, values),
    onSuccess: (company) => {
      queryClient.setQueryData(companyKeys.detail(id), company);
      void queryClient.invalidateQueries({ queryKey: companyKeys.all });
    },
  });
}

export function useUpdateCompanyStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: CompanyStatus) => updateCompanyStatus(id, status),
    onSuccess: (company) => {
      queryClient.setQueryData(companyKeys.detail(id), company);
      void queryClient.invalidateQueries({ queryKey: companyKeys.all });
    },
  });
}

/** Quanto tempo sem digitar antes de conferir o CNPJ. */
const DOCUMENT_CHECK_DELAY_MS = 500;

export type DocumentAvailabilityStatus = {
  /** A conferência do que está digitado agora ainda não terminou. */
  isChecking: boolean;
  /** Encontrada uma empresa com este CNPJ. */
  taken: boolean;
};

/**
 * CNPJ repetido, avisado enquanto a pessoa digita (RF-20).
 *
 * A API não tem rota de busca por documento — `GET /companies` só aceita `page`/`limit` —
 * então a conferência é feita sobre a varredura já usada pelos totais, em cache. O custo é
 * uma varredura por sessão, não uma requisição por tecla.
 *
 * Por isso o hook só afirma o negativo: quando acha o CNPJ, avisa; quando não acha, fica
 * calado, porque a empresa pode estar numa página que a varredura não leu ou ter sido
 * cadastrada agora há pouco. Quem recusa de fato continua sendo o `POST` — e é dele que
 * vem a certeza (ver `isDuplicateDocumentError`).
 *
 * `currentDocument` é o CNPJ que a empresa já usa: na edição ele pertence a ela mesma e
 * não pode ser lido como duplicidade.
 */
export function useDocumentAvailability(
  document: string,
  { currentDocument }: { currentDocument?: string } = {},
): DocumentAvailabilityStatus {
  const normalized = normalizeDocument(document);
  const debounced = useDebouncedValue(normalized, DOCUMENT_CHECK_DELAY_MS);

  // Mesma permissão da listagem, que é de onde os dados vêm.
  const canRead = usePermissions("companies:read");
  const worthChecking = shouldCheckDocumentAvailability(debounced, currentDocument);

  const directory = useCompanyDirectory({ enabled: canRead && worthChecking });

  // Enquanto o debounce não alcança o que está na tela, o que se sabe é sobre outro
  // documento — não serve nem para acusar, nem para liberar.
  const settled = debounced === normalized;
  const pendingCheck = shouldCheckDocumentAvailability(normalized, currentDocument);
  const match =
    settled && directory.data ? findCompanyByDocument(directory.data, debounced) : undefined;

  return {
    isChecking: canRead && pendingCheck && (!settled || directory.isFetching),
    taken: match !== undefined,
  };
}
