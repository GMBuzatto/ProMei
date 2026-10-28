"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUser } from "@/features/auth/context";
import { CHANGE_PASSWORD_ROUTE } from "@/lib/routes";

/**
 * A conta de quem está usando o painel.
 *
 * Os dados saem das claims do token (papéis e permissões efetivas) — a API não tem rota de
 * "meu perfil", então é o que existe. Mostrar as permissões efetivas resolve a pergunta mais
 * comum do suporte: "por que não consigo ver a tela X?".
 */
export function AccountSettings() {
  const { user } = useUser();

  return (
    <Card>
      <CardContent className="space-y-4">
        <header className="space-y-1">
          <h2 className="text-foreground text-lg font-semibold">Sua conta</h2>
          <p className="text-text-secondary text-sm">
            O que a sessão atual permite fazer, segundo o seu token de acesso.
          </p>
        </header>

        <dl className="space-y-3">
          <div className="space-y-1">
            <dt className="text-text-secondary text-xs tracking-wide uppercase">Papéis</dt>
            <dd className="flex flex-wrap gap-1">
              {user && user.roles.length > 0 ? (
                user.roles.map((role) => (
                  <Badge key={role} variant="info">
                    {role}
                  </Badge>
                ))
              ) : (
                <span className="text-text-tertiary text-sm">Nenhum papel atribuído</span>
              )}
            </dd>
          </div>

          <div className="space-y-1">
            <dt className="text-text-secondary text-xs tracking-wide uppercase">
              Permissões efetivas
            </dt>
            <dd className="text-text-secondary text-sm">
              {/* Super Admin passa em qualquer checagem sem listar permissão nenhuma — dizer
                  "0 permissões" para quem pode tudo seria o oposto da verdade. */}
              {user?.roles.includes("Super Admin")
                ? "Todas. Super Admin ignora a checagem de permissão (RN-01)."
                : `${user?.permissions.length ?? 0} permissões no formato recurso:ação.`}
            </dd>
          </div>
        </dl>

        <div>
          <Link
            href={CHANGE_PASSWORD_ROUTE}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Trocar minha senha
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
