import type { Metadata } from "next";
import { ItemForm } from "@/features/items/components/item-form";

export const metadata: Metadata = {
  title: "Novo item · ProMei",
  description: "Cadastre um item no catálogo.",
};

export default function NewItemPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Novo item</h1>
        <p className="text-text-secondary text-sm">
          O saldo começa em zero: para entrar estoque, registre uma movimentação de entrada.
        </p>
      </header>

      <ItemForm />
    </div>
  );
}
