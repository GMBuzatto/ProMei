export type { PaginatedResult } from "@/types/api";

/**
 * Espelho dos tipos da API para itens (ProMei-BE, módulo `items` — RF-30/31).
 *
 * Rota de **tenant**: o escopo de empresa vem do JWT, e usuário de plataforma recebe 404
 * (RN-02). Quem usa estas telas é gente da empresa, não Super Admin/Staff.
 */

/** `ItemStatus` do Prisma. Item não é excluído quando tem histórico — é inativado (RN-23). */
export const ITEM_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type Item = {
  id: string;
  companyId: string;
  /** Único por empresa, não globalmente (RN-20). Gerado pela API quando não informado. */
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  category: string | null;
  /** A API serializa `Decimal` como string para não perder precisão. */
  price: string;
  /** Saldo. Só muda por movimentação (RF-32/RN-22) — nenhuma tela de item escreve aqui. */
  stock: number;
  /** Piso de alerta (RF-35). `0` desliga o alerta. */
  minStock: number;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
  /**
   * `stock < minStock`, calculado pela API na resposta — não é coluna no banco.
   *
   * Vem pronto de propósito: o alerta de estoque mínimo é a mesma conta em toda tela, e
   * refazê-la no cliente abriria espaço para as duas divergirem.
   */
  belowMinStock: boolean;
};

/**
 * Desfecho de `DELETE /items/:id` (RN-23).
 *
 * São dois: item sem histórico sai do banco; item com movimentação apenas muda de estado.
 * A API responde 200 com o desfecho justamente para a tela poder dizer qual aconteceu.
 */
export const ITEM_REMOVAL_OUTCOMES = ["DELETED", "INACTIVATED"] as const;
export type ItemRemovalOutcome = (typeof ITEM_REMOVAL_OUTCOMES)[number];

export type ItemRemovalResult = {
  id: string;
  outcome: ItemRemovalOutcome;
};

export function isItemStatus(value: unknown): value is ItemStatus {
  return typeof value === "string" && (ITEM_STATUSES as readonly string[]).includes(value);
}
