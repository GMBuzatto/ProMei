"use client";

import { useIsPlatformUser } from "@/features/auth/use-permissions";
import { AccountSettings } from "./account-settings";
import { AppearanceSettings } from "./appearance-settings";
import { CompanySettings } from "./company-settings";
import { NicheSettings } from "./niche-settings";

/**
 * Configurações.
 *
 * Duas colunas em telas largas porque as seções são independentes entre si — ninguém precisa
 * rolar o tema para chegar na conta. O tema do nicho fica na coluna larga: é a única seção
 * com preview, e preview espremido não serve para decidir cor.
 *
 * **Sem tema do nicho para usuário de plataforma**: Super Admin/Staff não têm empresa (RN-05),
 * então não têm segmento; a paleta por nicho é da empresa que usa o painel. Quem define o
 * segmento de cada empresa faz isso no cadastro dela, em `/companies`.
 */
export function SettingsScreen() {
  const isPlatformUser = useIsPlatformUser();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-text-secondary text-sm">
          Aparência do painel, tema do seu segmento e dados da sua conta.
        </p>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          {isPlatformUser ? null : <NicheSettings />}
          <AppearanceSettings />
        </div>

        <div className="space-y-6">
          <CompanySettings />
          <AccountSettings />
        </div>
      </div>
    </div>
  );
}
