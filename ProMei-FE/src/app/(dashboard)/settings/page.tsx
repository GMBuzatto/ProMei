import type { Metadata } from "next";
import { SettingsScreen } from "@/features/settings/components/settings-screen";

export const metadata: Metadata = {
  title: "Configurações · ProMei",
  description: "Aparência do painel, tema do segmento e dados da conta.",
};

export default function SettingsPage() {
  return <SettingsScreen />;
}
