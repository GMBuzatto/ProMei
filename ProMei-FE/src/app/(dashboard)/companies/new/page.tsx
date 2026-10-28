import type { Metadata } from "next";
import { CreateCompanyForm } from "@/features/companies/components/create-company-form";

export const metadata: Metadata = {
  title: "Nova empresa · ProMei",
  description: "Provisione uma nova empresa contratante.",
};

export default function NewCompanyPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Nova empresa</h1>
        <p className="text-text-secondary text-sm">
          Cadastre a empresa contratante e o administrador que vai acessá-la.
        </p>
      </header>

      <CreateCompanyForm />
    </div>
  );
}
