import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Cartão de número do topo das listagens (empresas, planos).
 *
 * O estado `unavailable` existe porque nem todo número do mockup tem endpoint: em vez de
 * inventar ou somar o balde errado, o card mostra "-" e **diz por quê**. É a diferença entre
 * uma lacuna honesta e um número que alguém vai usar para decidir cobrança.
 */
export type StatTone = "brand" | "success" | "warning" | "danger" | "neutral";

const TONE_CLASSES: Record<StatTone, string> = {
  brand: "bg-surface-selected text-text-brand",
  success: "bg-status-success-bg text-status-success-icon",
  warning: "bg-status-warning-bg text-status-warning-icon",
  danger: "bg-status-danger-bg text-status-danger-icon",
  neutral: "bg-background-subtle text-text-tertiary",
};

export function StatCard({
  label,
  icon: Icon,
  tone,
  value,
  hint,
  loading = false,
  unavailable,
}: {
  label: string;
  icon: LucideIcon;
  tone: StatTone;
  /** Número já pronto, ou texto quando a métrica não é uma contagem (ex.: dinheiro). */
  value?: number | string;
  hint?: string;
  loading?: boolean;
  /** Motivo de a métrica não existir. Quando presente, vence o valor e o carregamento. */
  unavailable?: string;
}) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          TONE_CLASSES[tone],
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>

      <div className="min-w-0 space-y-0.5">
        <p className="text-text-secondary text-sm">{label}</p>

        {unavailable ? (
          <>
            <p className="text-text-tertiary text-2xl leading-8 font-bold" aria-hidden="true">
              -
            </p>
            <p className="text-text-tertiary text-xs leading-snug">{unavailable}</p>
          </>
        ) : loading ? (
          <div className="bg-background-subtle mt-1 h-7 w-16 animate-pulse rounded" />
        ) : (
          <>
            <p className="text-foreground text-2xl leading-8 font-bold tabular-nums">
              {typeof value === "number" ? value.toLocaleString("pt-BR") : (value ?? "-")}
            </p>
            {hint ? <p className="text-text-tertiary text-xs">{hint}</p> : null}
          </>
        )}
      </div>
    </Card>
  );
}
