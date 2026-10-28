import { describe, expect, it } from "vitest";
import { filterByType, periodStart, signedQuantity } from "@/features/inventory/history";
import type { StockMovementHistoryEntry, StockMovementType } from "@/features/inventory/types";

function entry(type: StockMovementType, id = type): StockMovementHistoryEntry {
  return {
    id,
    type,
    quantity: 1,
    reason: "Venda",
    createdAt: "2026-08-26T14:32:00.000Z",
    item: { id: "item-1", sku: "SKU-1", name: "Brigadeiro" },
    user: { id: "user-1", email: "ana@empresa.com.br" },
  };
}

describe("periodStart", () => {
  const now = new Date(2026, 7, 26, 14, 32); // 26/08/2026, 14h32 — horário local

  it("ancora na meia-noite, para o valor não mudar a cada render", () => {
    const start = new Date(periodStart("30", now) as string);

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
  });

  // Hoje conta como o primeiro dos "últimos 7 dias": 26/08 menos 6 dias = 20/08.
  it("inclui o dia de hoje na contagem", () => {
    const start = new Date(periodStart("7", now) as string);

    expect(start.getDate()).toBe(20);
    expect(start.getMonth()).toBe(7);
  });

  it("atravessa a virada de mês", () => {
    const start = new Date(periodStart("7", new Date(2026, 8, 3, 9, 0)) as string);

    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(28);
  });

  it("não manda dateFrom quando o período é todo o histórico", () => {
    expect(periodStart("ALL", now)).toBeUndefined();
  });
});

describe("filterByType", () => {
  const entries = [entry("IN"), entry("OUT"), entry("ADJUSTMENT")];

  it("devolve tudo em ALL", () => {
    expect(filterByType(entries, "ALL")).toHaveLength(3);
  });

  it("filtra pelo tipo pedido", () => {
    expect(filterByType(entries, "OUT").map((item) => item.id)).toEqual(["OUT"]);
  });
});

describe("signedQuantity", () => {
  // A API manda saída como positiva — quem dá o sinal na leitura é a tela.
  it("mostra a saída como negativa", () => {
    expect(signedQuantity("OUT", 25)).toBe("-25");
  });

  it("mostra a entrada como positiva", () => {
    expect(signedQuantity("IN", 200)).toBe("+200");
  });

  it("preserva o sinal do ajuste", () => {
    expect(signedQuantity("ADJUSTMENT", -2)).toBe("-2");
    expect(signedQuantity("ADJUSTMENT", 2)).toBe("+2");
  });

  it("não inventa sinal para zero", () => {
    expect(signedQuantity("IN", 0)).toBe("0");
  });
});
