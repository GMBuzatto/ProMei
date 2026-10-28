"use client";

import { LogOut, UserRound } from "lucide-react";
import { useLogout } from "@/features/auth/hooks";
import { useUser } from "@/features/auth/context";
import { isPlatformUser } from "@/features/auth/permissions";

/**
 * Rodapé da navegação: quem está na sessão e a saída.
 *
 * Até aqui o painel não tinha **nenhum** caminho de logout — `useLogout` existia sem gatilho,
 * e a única forma de sair era limpar o storage na mão.
 *
 * A identificação sai das claims do token (papéis e a fronteira empresa/plataforma) porque é
 * o que existe: a API não tem rota de perfil, e `UserResponseDto` só chega nas telas de
 * equipe. Buscar `GET /users/:id` daqui daria 403 para colaborador sem `users:read` e 404
 * para usuário de plataforma — erro no rodapé de todas as telas para exibir um e-mail.
 */
export function SidebarUser({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useUser();
  const logout = useLogout();

  const roles = user?.roles ?? [];
  const scope = isPlatformUser(user) ? "Plataforma" : "Empresa";

  return (
    // `mt-auto` encosta o bloco na base da tela enquanto há espaço sobrando; quando o menu
    // enche a coluna, a margem automática vira zero e ele passa a ser o último item da lista.
    // `shrink-0` impede que ele seja espremido nesse caso.
    <div className="border-nav-border mt-auto shrink-0 space-y-3 border-t p-3 pt-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="bg-background-subtle text-text-secondary flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        >
          <UserRound className="h-4 w-4" />
        </span>

        <div className="min-w-0">
          <p className="text-foreground truncate text-sm font-medium">
            {roles.length > 0 ? roles.join(" · ") : "Sessão ativa"}
          </p>
          <p className="text-text-tertiary truncate text-xs">{scope}</p>
        </div>
      </div>

      <button
        type="button"
        disabled={logout.isPending}
        onClick={() => {
          onNavigate?.();
          logout.mutate();
        }}
        className="text-nav-text hover:bg-nav-item-hover hover:text-nav-text-hover focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none"
      >
        <LogOut className="text-nav-icon h-4 w-4 shrink-0" aria-hidden="true" />
        {logout.isPending ? "Saindo..." : "Sair"}
      </button>
    </div>
  );
}
