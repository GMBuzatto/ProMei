import { describe, expect, it } from "vitest";
import {
  acceptsNegativeQuantity,
  exceedsAvailableStock,
  MOVEMENT_TYPE_META,
  movementTypeLabel,
  projectedStock,
  stockDelta,
} from "@/features/inventory/movement";
import { STOCK_MOVEMENT_TYPES } from "@/features/inventory/types";

describe("stockDelta", () => {
  // A direção vem do tipo: saída de 10 é enviada como `quantity: 10` e subtrai 10.
  it("subtrai na saída e soma na entrada", () => {
    expect(stockDelta("OUT", 10)).toBe(-10);
    expect(stockDelta("IN", 10)).toBe(10);
  });

  it("respeita o sinal do ajuste, que é o único assinado", () => {
    expect(stockDelta("ADJUSTMENT", -3)).toBe(-3);
    expect(stockDelta("ADJUSTMENT", 3)).toBe(3);
  });
});

describe("projectedStock", () => {
  it("mostra o saldo que o item terá", () => {
    expect(projectedStock(120, "OUT", 20)).toBe(100);
    expect(projectedStock(120, "IN", 20)).toBe(140);
    expect(projectedStock(120, "ADJUSTMENT", -5)).toBe(115);
  });
});

describe("exceedsAvailableStock", () => {
  it("acusa saída maior que o saldo (RN-21)", () => {
    expect(exceedsAvailableStock(5, "OUT", 6)).toBe(true);
  });

  it("aceita zerar o saldo exatamente", () => {
    expect(exceedsAvailableStock(5, "OUT", 5)).toBe(false);
  });

  it("não trava entrada nenhuma", () => {
    expect(exceedsAvailableStock(0, "IN", 999)).toBe(false);
  });

  it("acusa ajuste negativo que deixaria o saldo abaixo de zero", () => {
    expect(exceedsAvailableStock(2, "ADJUSTMENT", -3)).toBe(true);
    expect(exceedsAvailableStock(2, "ADJUSTMENT", -2)).toBe(false);
  });
});

describe("MOVEMENT_TYPE_META", () => {
  it("cobre os três tipos que a API aceita", () => {
    for (const type of STOCK_MOVEMENT_TYPES) {
      expect(MOVEMENT_TYPE_META[type].label.length).toBeGreaterThan(0);
      expect(MOVEMENT_TYPE_META[type].action.length).toBeGreaterThan(0);
    }
  });

  // Entrada e saída sugerem o caso comum; ajuste exige explicação de quem corrige.
  it("sugere motivo para entrada e saída, e nenhum para ajuste", () => {
    expect(MOVEMENT_TYPE_META.OUT.defaultReason).toBe("Venda");
    expect(MOVEMENT_TYPE_META.IN.defaultReason).toBe("Compra");
    expect(MOVEMENT_TYPE_META.ADJUSTMENT.defaultReason).toBe("");
  });

  it("traduz o tipo", () => {
    expect(movementTypeLabel("OUT")).toBe("Saída");
    expect(acceptsNegativeQuantity("ADJUSTMENT")).toBe(true);
    expect(acceptsNegativeQuantity("OUT")).toBe(false);
  });
});
