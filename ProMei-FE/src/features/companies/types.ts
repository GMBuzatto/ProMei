export type { PaginatedResult } from "@/types/api";

/**
 * Espelho dos tipos da API para empresas (ProMei-BE, módulo `companies`).
 *
 * Os enums são reproduzidos como const arrays em vez de `enum` do TypeScript porque
 * precisam existir em runtime (popular selects, validar payload com zod) e porque os
 * valores vêm do Prisma — se a API acrescentar um segmento, este arquivo é o único
 * ponto do front que muda.
 */

/** `CompanySegment` do Prisma. Define o nicho — e portanto o tema — do painel da empresa. */
export const COMPANY_SEGMENTS = ["FOOD", "HEALTH", "RETAIL", "SERVICES", "OTHER"] as const;
export type CompanySegment = (typeof COMPANY_SEGMENTS)[number];

/** `CompanyStatus` do Prisma (RN-11). */
export const COMPANY_STATUSES = ["ACTIVE", "SUSPENDED", "CANCELED"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export type Company = {
  id: string;
  name: string;
  document: string;
  status: CompanyStatus;
  segment: CompanySegment;
  /** ISO 8601 — a API serializa `DateTime` como string no JSON. */
  createdAt: string;
  updatedAt: string;
};

/**
 * Retorno de `POST /companies`. Criar empresa é **provisionar**: a API devolve os ids
 * do admin e dos papéis criados junto, para quem chamou conseguir seguir cadastrando
 * colaboradores sem precisar descobrir o papel.
 */
export type ProvisionedCompany = {
  company: Company;
  adminUserId: string;
  adminRoleId: string;
  collaboratorRoleId: string;
};

export function isCompanySegment(value: unknown): value is CompanySegment {
  return typeof value === "string" && (COMPANY_SEGMENTS as readonly string[]).includes(value);
}

export function isCompanyStatus(value: unknown): value is CompanyStatus {
  return typeof value === "string" && (COMPANY_STATUSES as readonly string[]).includes(value);
}
