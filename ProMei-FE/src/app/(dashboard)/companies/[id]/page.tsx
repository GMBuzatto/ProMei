import type { Metadata } from "next";
import { CompanyDetails } from "@/features/companies/components/company-details";

export const metadata: Metadata = {
  title: "Detalhes da empresa · ProMei",
};

export default async function CompanyDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CompanyDetails companyId={id} />;
}
