import type { Metadata } from "next";
import { CompaniesList } from "@/features/companies/components/companies-list";

export const metadata: Metadata = {
  title: "Empresas · ProMei",
  description: "Gerencie as empresas contratantes da plataforma.",
};

/** RN-10: recurso de plataforma — só Super Admin/Staff. A API é quem recusa os demais. */
export default function CompaniesPage() {
  return <CompaniesList />;
}
