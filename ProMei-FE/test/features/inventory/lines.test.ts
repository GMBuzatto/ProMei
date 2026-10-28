import { describe, expect, it } from "vitest";
import type { Item } from "@/features/items/types";
import {
  canSubmitLines,
  collectLineErrors,
  lineError,
  parseLineQuantity,
} from "@/features/inventory/lines";

function item(stock: number, id = crypto.randomUUID()): Item {
  return {
    id,
    companyId: "c",
    sku: `SKU-${id.slice(0, 4)}`,
    name: `Item ${id.slice(0, 4)}`,
    description: null,
    unit: "un",
    category: null,
    price: "10.00",
    stock,
    minStock: 0,
    status: "ACTIVE",
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    belowMinStock: false,
  };
}

describe("parseLineQuantity", () => {
  it("lê inteiros", () => {
    expect(parseLineQuantity("10")).toBe(10);
    expect(parseLineQuantity(" -3 ")).toBe(-3);
  });

  it("recusa vazio e fracionado", () => {
    expect(parseLineQuantity("")).toBeNull();
    expect(parseLineQuantity("2,5")).toBeNull();
    expect(parseLineQuantity("abc")).toBeNull();
  });
});

describe("lineError", () => {
  it("aceita saída que cabe no saldo", () => {
    expect(lineError({ item: item(120), quantity: "20" }, "OUT")).toBeUndefined();
  });

  it("aceita zerar o saldo exatamente", () => {
    expect(lineError({ item: item(20), quantity: "20" }, "OUT")).toBeUndefined();
  });

  // RN-21: o estoque nunca fica negativo.
  it("acusa saída maior que o saldo, dizendo quanto há", () => {
    expect(lineError({ item: item(5), quantity: "6" }, "OUT")).toBe(
      "Saldo insuficiente: 5 un disponíveis.",
    );
  });

  it("recusa quantidade zero", () => {
    expect(lineError({ item: item(5), quantity: "0" }, "OUT")).toBe(
      "A quantidade não pode ser zero.",
    );
  });

  it("recusa negativo em entrada e saída, mas aceita em ajuste", () => {
    expect(lineError({ item: item(5), quantity: "-1" }, "OUT")).toMatch(/positiva/);
    expect(lineError({ item: item(5), quantity: "-1" }, "IN")).toMatch(/positiva/);
    expect(lineError({ item: item(5), quantity: "-1" }, "ADJUSTMENT")).toBeUndefined();
  });

  it("não limita entrada pelo saldo atual", () => {
    expect(lineError({ item: item(0), quantity: "500" }, "IN")).toBeUndefined();
  });
});

describe("collectLineErrors", () => {
  it("marca cada linha problemática pelo id do item", () => {
    const ok = item(100);
    const semSaldo = item(1);

    const errors = collectLineErrors(
      [
        { item: ok, quantity: "10" },
        { item: semSaldo, quantity: "5" },
      ],
      "OUT",
    );

    expect(errors[ok.id]).toBeUndefined();
    expect(errors[semSaldo.id]).toMatch(/Saldo insuficiente/);
  });
});

describe("canSubmitLines", () => {
  it("exige pelo menos uma linha", () => {
    expect(canSubmitLines([], "OUT")).toBe(false);
  });

  // A gravação não é atômica: mandar um lote com erro conhecido gravaria as linhas boas
  // antes de parar na ruim.
  it("bloqueia o lote inteiro quando uma linha tem erro conhecido", () => {
    const lines = [
      { item: item(100), quantity: "10" },
      { item: item(1), quantity: "5" },
    ];

    expect(canSubmitLines(lines, "OUT")).toBe(false);
  });

  it("libera quando todas as linhas estão válidas", () => {
    const lines = [
      { item: item(100), quantity: "10" },
      { item: item(50), quantity: "5" },
    ];

    expect(canSubmitLines(lines, "OUT")).toBe(true);
  });
});
