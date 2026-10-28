import { describe, expect, it } from "vitest";
import {
  countStockAlerts,
  isStockAlert,
  sortByStockUrgency,
  stockAlertLabel,
  stockLevel,
} from "@/features/items/stock";

function item(stock: number, minStock: number, belowMinStock = stock < minStock) {
  return { stock, minStock, belowMinStock };
}

describe("stockLevel", () => {
  it("marca saldo abaixo do mínimo", () => {
    expect(stockLevel(item(3, 10))).toBe("low");
  });

  it("não alerta quando o saldo cobre o mínimo", () => {
    expect(stockLevel(item(10, 10))).toBe("ok");
    expect(stockLevel(item(50, 10))).toBe("ok");
  });

  // Zerado é destacado mesmo sem mínimo definido — "acabou" já é o alerta.
  it("destaca saldo zerado mesmo com o alerta desligado", () => {
    expect(stockLevel(item(0, 0))).toBe("empty");
    expect(stockLevel(item(0, 5))).toBe("empty");
  });

  it("não inventa alerta para item sem mínimo e com saldo", () => {
    expect(stockLevel(item(7, 0))).toBe("ok");
  });

  // A conta é da API: se ela disser que está abaixo, a tela respeita.
  it("segue o `belowMinStock` que a API calculou", () => {
    expect(stockLevel({ stock: 9, minStock: 0, belowMinStock: true })).toBe("low");
  });
});

describe("stockAlertLabel", () => {
  it("explica o motivo do destaque", () => {
    expect(stockAlertLabel(item(3, 10))).toBe("Abaixo do mínimo (10)");
    expect(stockAlertLabel(item(0, 10))).toBe("Sem estoque");
  });

  it("não rotula item em ordem", () => {
    expect(stockAlertLabel(item(20, 10))).toBeUndefined();
  });
});

describe("countStockAlerts", () => {
  it("conta os itens em alerta da página", () => {
    expect(countStockAlerts([item(3, 10), item(20, 10), item(0, 0), item(11, 10)])).toBe(2);
  });

  it("devolve zero quando está tudo em ordem", () => {
    expect(countStockAlerts([item(20, 10), item(5, 1)])).toBe(0);
    expect(countStockAlerts([])).toBe(0);
  });
});

describe("isStockAlert", () => {
  it("resume os dois níveis de alerta", () => {
    expect(isStockAlert(item(3, 10))).toBe(true);
    expect(isStockAlert(item(0, 0))).toBe(true);
    expect(isStockAlert(item(20, 10))).toBe(false);
  });
});

describe("sortByStockUrgency", () => {
  it("põe o que acabou na frente do que está abaixo do mínimo", () => {
    const ordered = sortByStockUrgency([item(3, 10), item(0, 10), item(20, 10)]);

    expect(ordered.map((entry) => entry.stock)).toEqual([0, 3, 20]);
  });

  it("desempata pelo menor saldo", () => {
    const ordered = sortByStockUrgency([item(8, 10), item(2, 10), item(5, 10)]);

    expect(ordered.map((entry) => entry.stock)).toEqual([2, 5, 8]);
  });

  it("não reordena a lista de origem, que vem do cache", () => {
    const original = [item(20, 10), item(0, 10)];
    sortByStockUrgency(original);

    expect(original.map((entry) => entry.stock)).toEqual([20, 0]);
  });
});
