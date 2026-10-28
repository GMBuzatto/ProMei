"use client";

import { ArrowRight, Building2 } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useIsPlatformUser } from "@/features/auth/use-permissions";

/**
 * Dados cadastrais da empresa.
 *
 * **A empresa não edita o próprio cadastro** — e isso é regra, não limitação de tela: RN-10
 * põe a criação e a manutenção de empresas na plataforma, e `/companies` é `@PlatformRoute`
 * na API, então o Admin da empresa recebe 404 lá. Um formulário aqui só produziria erro.
 *
 * O que a tela faz é dizer isso e apontar o caminho certo para cada lado: quem é da plataforma
 * vai para a tela de Empresas; quem é da empresa fala com o suporte.
 */
export function CompanySettings() {
  const isPlatformUser = useIsPlatformUser();

  return (
    <Card>
      <CardContent className="space-y-4">
        <header className="space-y-1">
          <h2 className="text-foreground text-lg font-semibold">Dados da empresa</h2>
          <p className="text-text-secondary text-sm">
            Razão social, CNPJ, segmento e situação fazem parte do cadastro da empresa.
          </p>
        </header>

        <div className="border-border bg-surface-subtle flex gap-3 rounded-lg border p-4">
          <Building2 className="text-text-secondary mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />

          <div className="min-w-0 space-y-3">
            <p className="text-text-secondary text-sm leading-relaxed">
              {isPlatformUser
                ? "Cadastro, plano e situação das empresas são mantidos na tela de Empresas, com trilha de auditoria de quem alterou o quê."
                : "Esses dados são mantidos pela equipe da plataforma (RN-10). Para corrigir razão social, CNPJ ou segmento, fale com o suporte. A alteração fica registrada na auditoria."}
            </p>

            {isPlatformUser ? (
              <Link
                href="/companies"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Ir para Empresas
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
