import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  canTransition,
  subscriptionStatusLabel,
  TRANSITION_COPY,
} from "@/features/subscriptions/state";
import { SUBSCRIPTION_STATUSES } from "@/features/subscriptions/types";

/**
 * A máquina de estados aqui existe para a tela não oferecer botão que a API recusaria.
 * Estes testes são o contrato com `subscription-state.ts` do back-end (RN-12).
 */
describe("máquina de estados da assinatura (RN-12)", () => {
  it("segue o caminho da regra: teste → ativa → inadimplente → ativa", () => {
    expect(canTransition("TRIAL", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "PAST_DUE")).toBe(true);
    expect(canTransition("PAST_DUE", "ACTIVE")).toBe(true);
  });

  it("permite cancelar de qualquer estado vivo", () => {
    expect(canTransition("TRIAL", "CANCELED")).toBe(true);
    expect(canTransition("ACTIVE", "CANCELED")).toBe(true);
    expect(canTransition("PAST_DUE", "CANCELED")).toBe(true);
  });

  // Cancelada é terminal: o histórico de cobrança precisa continuar legível depois.
  it("não oferece saída de cancelada", () => {
    expect(allowedTransitions("CANCELED")).toEqual([]);
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(canTransition("CANCELED", status)).toBe(false);
    }
  });

  it("não permite pular de teste direto para inadimplente", () => {
    expect(canTransition("TRIAL", "PAST_DUE")).toBe(false);
  });

  it("não oferece transição para o próprio estado", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(allowedTransitions(status)).not.toContain(status);
    }
  });

  it("tem texto de confirmação para toda transição oferecida", () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      for (const target of allowedTransitions(status)) {
        expect(TRANSITION_COPY[target].confirmLabel.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("subscriptionStatusLabel", () => {
  it("traduz os estados da RN-12", () => {
    expect(subscriptionStatusLabel("TRIAL")).toBe("Em teste");
    expect(subscriptionStatusLabel("PAST_DUE")).toBe("Inadimplente");
    expect(subscriptionStatusLabel("CANCELED")).toBe("Cancelada");
  });
});
