"use client";

import { ApiErrorAlert } from "@/components/api-error-alert";
import { useItem } from "../hooks";
import { ItemForm } from "./item-form";

/**
 * Carrega o item antes de montar o formulário — sem os valores atuais ele nasceria vazio e
 * um "salvar" sobrescreveria o cadastro com campos em branco.
 */
export function EditItemScreen({ itemId }: { itemId: string }) {
  const { data: item, isPending, error } = useItem(itemId);

  if (isPending) {
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <span className="sr-only">Carregando item...</span>
        <div className="border-border bg-surface h-96 animate-pulse rounded-lg border" />
      </div>
    );
  }

  if (error) return <ApiErrorAlert error={error} />;
  if (!item) return null;

  return <ItemForm item={item} />;
}
