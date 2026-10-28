import type { Metadata } from "next";
import { EditCompanyScreen } from "@/features/companies/components/edit-company-screen";

export const metadata: Metadata = {
  title: "Editar empresa · ProMei",
};

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Editar empresa</h1>
        <p className="text-text-secondary text-sm">
          Atualize os dados cadastrais e o nicho da empresa contratante.
        </p>
      </header>

      <EditCompanyScreen companyId={id} />
    </div>
  );
}
