import type { Metadata } from "next";
import { UsersList } from "@/features/users/components/users-list";

export const metadata: Metadata = {
  title: "Usuários · ProMei",
  description: "Equipe da empresa: acesso, papéis e situação.",
};

/** Rota de tenant: o Admin gerencia apenas a própria empresa (RN-02). */
export default function UsersPage() {
  return <UsersList />;
}
