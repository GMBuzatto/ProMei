import type { Metadata } from "next";
import { ItemsList } from "@/features/items/components/items-list";

export const metadata: Metadata = {
  title: "Itens · ProMei",
  description: "Catálogo de itens da empresa.",
};

/** Rota de tenant: o escopo de empresa vem do JWT (RN-02). */
export default function ItemsPage() {
  return <ItemsList />;
}
