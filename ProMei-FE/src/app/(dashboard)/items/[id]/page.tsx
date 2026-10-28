import type { Metadata } from "next";
import { ItemDetails } from "@/features/items/components/item-details";

export const metadata: Metadata = {
  title: "Detalhes do item · ProMei",
};

export default async function ItemDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <ItemDetails itemId={id} />;
}
