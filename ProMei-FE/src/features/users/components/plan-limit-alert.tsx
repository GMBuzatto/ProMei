import { Info } from "lucide-react";

/**
 * A mensagem clara do limite de usuários do plano (RN-14) — aceite desta entrega.
 *
 * A tela **não** repassa o texto da API aqui: ele chega como "O plan Básico permite 15
 * usuários activeCount", o que não ajuda quem precisa decidir o que fazer agora. O `code`
 * (`LIMITE_PLANO_EXCEDIDO`) é confiável; a redação é nossa.
 *
 * As duas saídas ditas por extenso importam porque só uma delas está nas mãos de quem lê:
 * desativar alguém libera vaga na hora (só usuário **ativo** ocupa lugar, e desativar não
 * apaga histórico); trocar de plano é rota de plataforma — a empresa não muda a própria
 * assinatura, então o caminho é falar com o suporte, e prometer um botão de upgrade aqui
 * seria mentira.
 */
export function PlanLimitAlert({ activeUsers }: { activeUsers: number }) {
  return (
    <div
      role="alert"
      className="bg-status-info-bg border-status-info-border flex gap-3 rounded-md border p-4"
    >
      <Info className="text-status-info-icon mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />

      <div className="min-w-0 space-y-1">
        <p className="text-status-info-text text-sm font-medium">
          Limite de usuários do seu plano atingido
        </p>
        <p className="text-status-info-text text-sm leading-relaxed">
          Seu plano não permite mais usuários ativos do que os {activeUsers} que a empresa já tem.
          Para abrir uma vaga agora, desative alguém que não usa mais o sistema. O histórico dele é
          preservado e ele pode ser reativado depois. Para aumentar o limite, fale com o suporte: a
          troca de plano é feita pela equipe da plataforma.
        </p>
      </div>
    </div>
  );
}
