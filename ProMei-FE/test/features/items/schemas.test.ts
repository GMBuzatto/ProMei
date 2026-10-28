import { describe, expect, it } from "vitest";
import { initialStockSchema, itemSchema } from "@/features/items/schemas";

const BASE = {
  name: "Café torrado 500g",
  unit: "un",
  price: "12,90",
  sku: "",
  category: "",
  description: "",
  minStock: "",
};

describe("itemSchema", () => {
  it("converte o preço digitado em pt-BR para número", () => {
    const result = itemSchema.safeParse(BASE);

    expect(result.success).toBe(true);
    expect(result.data?.price).toBe(12.9);
  });

  // A API aceita o campo ausente, mas nunca vazio (`MinLength(1)` nos DTOs).
  it("omite os opcionais em branco em vez de mandar string vazia", () => {
    const result = itemSchema.safeParse(BASE);

    expect(result.data?.sku).toBeUndefined();
    expect(result.data?.category).toBeUndefined();
    expect(result.data?.description).toBeUndefined();
  });

  it("exige nome, unidade e preço (RN-25)", () => {
    expect(itemSchema.safeParse({ ...BASE, name: "  " }).success).toBe(false);
    expect(itemSchema.safeParse({ ...BASE, unit: "" }).success).toBe(false);
    expect(itemSchema.safeParse({ ...BASE, price: "" }).success).toBe(false);
  });

  it("recusa preço com mais de duas casas ou acima do teto da coluna", () => {
    expect(itemSchema.safeParse({ ...BASE, price: "12,999" }).success).toBe(false);
    expect(itemSchema.safeParse({ ...BASE, price: "100000000" }).success).toBe(false);
  });

  // Zero é resposta válida: significa "sem alerta de mínimo".
  it("aceita estoque mínimo zero e trata vazio como ausente", () => {
    expect(itemSchema.safeParse({ ...BASE, minStock: "0" }).data?.minStock).toBe(0);
    expect(itemSchema.safeParse({ ...BASE, minStock: "" }).data?.minStock).toBeUndefined();
    expect(itemSchema.safeParse({ ...BASE, minStock: "-1" }).success).toBe(false);
    expect(itemSchema.safeParse({ ...BASE, minStock: "1,5" }).success).toBe(false);
  });
});

describe("initialStockSchema", () => {
  it("lê a quantidade inicial", () => {
    expect(initialStockSchema.safeParse("10").data).toBe(10);
  });

  it("trata vazio como 'começa zerado'", () => {
    expect(initialStockSchema.safeParse("").data).toBeUndefined();
  });

  // A API recusa movimentação de quantidade zero: seria ruído no histórico.
  it("recusa zero, negativo e fracionado", () => {
    expect(initialStockSchema.safeParse("0").success).toBe(false);
    expect(initialStockSchema.safeParse("-5").success).toBe(false);
    expect(initialStockSchema.safeParse("2,5").success).toBe(false);
  });
});
