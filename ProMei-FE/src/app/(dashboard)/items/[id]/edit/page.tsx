import type { Metadata } from "next";
import { EditItemScreen } from "@/features/items/components/edit-item-screen";

export const metadata: Metadata = {
  title: "Editar item · ProMei",
};

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Editar item</h1>
        <p className="text-text-secondary text-sm">
          Alterações valem para o catálogo; o saldo em estoque não muda por aqui.
        </p>
      </header>

      <EditItemScreen itemId={id} />
    </div>
  );
}
