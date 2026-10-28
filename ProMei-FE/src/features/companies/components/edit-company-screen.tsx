"use client";

import { ApiErrorAlert } from "@/components/api-error-alert";
import { useCompany } from "../hooks";
import { EditCompanyForm } from "./edit-company-form";

/**
 * Carrega a empresa antes de montar o formulário de edição — sem os valores atuais o
 * formulário nasceria vazio e um "salvar" apagaria os dados.
 */
export function EditCompanyScreen({ companyId }: { companyId: string }) {
  const { data: company, isPending, error } = useCompany(companyId);

  if (isPending) {
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <span className="sr-only">Carregando empresa...</span>
        <div className="border-border bg-surface h-96 animate-pulse rounded-lg border" />
      </div>
    );
  }

  if (error) return <ApiErrorAlert error={error} />;
  if (!company) return null;

  return <EditCompanyForm company={company} />;
}
