import { AlertTriangle } from "lucide-react";
import { toDisplayableError } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Exibição padrão de erro da API.
 *
 * Mostra a mensagem em pt-BR **e o `code` de negócio** (aceite do épico FE-1): é o código
 * que o suporte e o log da API compartilham. Junto vai o correlation id, que fecha o
 * caminho print do usuário → linha do log (docs/13-observabilidade.md).
 *
 * Só tokens semânticos — nada de hex ou cor Tailwind crua (docs/16-configuracao-sem-hardcode.md).
 */
export function ApiErrorAlert({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;

  const { message, code, correlationId } = toDisplayableError(error);

  return (
    <div
      role="alert"
      className={cn(
        "bg-status-danger-bg border-status-danger-border flex gap-3 rounded-md border p-4",
        className,
      )}
    >
      <AlertTriangle className="text-status-danger-icon mt-0.5 h-5 w-5 shrink-0" aria-hidden />

      <div className="min-w-0 space-y-1">
        <p className="text-status-danger-text text-sm font-medium">{message}</p>

        {code ? (
          <p className="text-text-tertiary font-mono text-xs">
            <span className="sr-only">Código do erro: </span>
            {code}
            {correlationId ? ` · ${correlationId}` : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
