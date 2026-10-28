import type { Metadata } from "next";
import { RolesList } from "@/features/roles/components/roles-list";

export const metadata: Metadata = {
  title: "Papéis e permissões · ProMei",
  description: "Papéis da empresa e o que cada um permite fazer.",
};

/** Rota de tenant: o Admin gerencia os papéis da própria empresa (RN-02). */
export default function RolesPage() {
  return <RolesList />;
}
