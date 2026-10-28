/**
 * Formas que a API repete em todo módulo. Ficam aqui, e não dentro de um domínio, porque
 * pertencem ao contrato HTTP — não a empresas, planos ou assinaturas.
 */

/** Envelope de paginação (`PaginatedResult<T>` nos services da API). */
export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};
