import type { Metadata } from "next";
import { Suspense } from "react";
import { PermissionGate } from "@/features/auth/components/permission-gate";
import { MovementHistory } from "@/features/inventory/components/movement-history";
import { StockMovementForm } from "@/features/inventory/components/stock-movement-form";

export const metadata: Metadata = {
  title: "Movimentação de estoque · ProMei",
  description: "Registre entradas, saídas e ajustes e consulte o histórico do estoque.",
};

/**
 * Rota de tenant: a empresa vem do JWT (RN-02).
 *
 * O `Suspense` existe porque o formulário lê `?type=` com `useSearchParams`, que o Next exige
 * dentro de um limite de suspensão para a página poder ser pré-renderizada.
 */
export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          Movimentação de estoque
        </h1>
        <p className="text-text-secondary text-sm">
          Entrada, saída ou ajuste. O saldo do item muda apenas por aqui.
        </p>
      </header>

      <Suspense fallback={<FormSkeleton />}>
        <StockMovementForm />
      </Suspense>

      {/* Registrar e consultar são permissões diferentes na API (`stock-movements:create` e
          `:read`): quem só registra não veria o histórico, e o gate evita desenhar uma tabela
          que voltaria 403. */}
      <PermissionGate permissions="stock-movements:read">
        <MovementHistory />
      </PermissionGate>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Carregando formulário de movimentação...</span>
      <div className="border-border bg-surface h-96 animate-pulse rounded-lg border" />
    </div>
  );
}
