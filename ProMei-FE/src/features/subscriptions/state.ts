import type { SubscriptionStatus } from "./types";

/**
 * Máquina de estados da assinatura — RN-12.
 *
 * `trial` → `ativa` → `inadimplente` → (`ativa` ao regularizar | `cancelada` após 30 dias)
 *
 * Espelha `ALLOWED_TRANSITIONS` da API (`subscription-state.ts`). Espelhar importa por dois
 * motivos: a tela não oferece um botão que a API recusaria com `TRANSICAO_INVALIDA`, e
 * `cancelada` — que é terminal — não aparece como origem de nada. Se a regra mudar lá, este
 * arquivo é o único ponto do front que muda.
 */
export const ALLOWED_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  TRIAL: ["ACTIVE", "CANCELED"],
  ACTIVE: ["PAST_DUE", "CANCELED"],
  PAST_DUE: ["ACTIVE", "CANCELED"],
  CANCELED: [],
};

export function allowedTransitions(from: SubscriptionStatus): SubscriptionStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return allowedTransitions(from).includes(to);
}

/**
 * Rótulo e cor de cada estado. Cores semânticas — fixas em todo nicho, porque o significado
 * de "inadimplente" não pode depender do segmento da empresa (docs/styles/temas/README.md).
 */
export const SUBSCRIPTION_STATUS_META: Record<
  SubscriptionStatus,
  { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral"; hint: string }
> = {
  TRIAL: {
    label: "Em teste",
    variant: "info",
    hint: "Período de avaliação. O acesso é normal até a assinatura ser ativada ou cancelada.",
  },
  ACTIVE: {
    label: "Ativa",
    variant: "success",
    hint: "Assinatura em dia: a empresa usa o painel sem restrição.",
  },
  PAST_DUE: {
    label: "Inadimplente",
    variant: "warning",
    hint: "Pagamento em atraso: a empresa fica em modo leitura (RN-13).",
  },
  CANCELED: {
    label: "Cancelada",
    variant: "neutral",
    hint: "Estado terminal: retomar exige uma nova assinatura.",
  },
};

export function subscriptionStatusLabel(status: SubscriptionStatus): string {
  return SUBSCRIPTION_STATUS_META[status]?.label ?? status;
}

/**
 * Texto de cada transição no diálogo de confirmação.
 *
 * A consequência é escrita em termos do que muda para a empresa — quem clica precisa saber
 * que "inadimplente" corta a escrita do painel (RN-13) antes de confirmar, não depois.
 */
export type TransitionCopy = {
  action: string;
  title: string;
  question: string;
  consequence: string;
  confirmLabel: string;
  pendingLabel: string;
  destructive: boolean;
};

export const TRANSITION_COPY: Record<SubscriptionStatus, TransitionCopy> = {
  ACTIVE: {
    action: "Ativar assinatura",
    title: "Ativar assinatura",
    question: "Deseja ativar a assinatura desta empresa?",
    consequence:
      "A empresa passa a ter acesso completo ao painel. Use ao confirmar o pagamento ou ao encerrar o período de teste.",
    confirmLabel: "Ativar assinatura",
    pendingLabel: "Ativando...",
    destructive: false,
  },
  PAST_DUE: {
    action: "Marcar como inadimplente",
    title: "Marcar como inadimplente",
    question: "Marcar esta assinatura como inadimplente?",
    consequence:
      "A empresa entra em modo leitura (RN-13): consulta os dados, mas não cria nem edita nada até regularizar.",
    confirmLabel: "Marcar inadimplente",
    pendingLabel: "Marcando...",
    destructive: true,
  },
  CANCELED: {
    action: "Cancelar assinatura",
    title: "Cancelar assinatura",
    question: "Tem certeza que deseja cancelar esta assinatura?",
    consequence:
      "O cancelamento é definitivo: não há volta para ativa, e retomar exige criar uma nova assinatura (RN-12).",
    confirmLabel: "Cancelar assinatura",
    pendingLabel: "Cancelando...",
    destructive: true,
  },
  TRIAL: {
    action: "Voltar para teste",
    title: "Voltar para teste",
    question: "Voltar esta assinatura para o período de teste?",
    consequence: "A empresa volta ao estado de avaliação.",
    confirmLabel: "Voltar para teste",
    pendingLabel: "Alterando...",
    destructive: false,
  },
};
