import { describe, expect, it } from "vitest";
import { formatMoney, parseMoneyInput, toMoneyInput } from "@/lib/money";

describe("formatMoney", () => {
  it("formata o decimal em string da API como moeda", () => {
    expect(formatMoney("149.9")).toMatch(/149,90/);
    expect(formatMoney(0)).toMatch(/0,00/);
  });

  it("não quebra com valor não numérico", () => {
    expect(formatMoney("sob consulta")).toBe("sob consulta");
  });
});

describe("parseMoneyInput", () => {
  it("lê o valor digitado em pt-BR", () => {
    expect(parseMoneyInput("149,90")).toBe(149.9);
    expect(parseMoneyInput("1.234,56")).toBe(1234.56);
    expect(parseMoneyInput("0")).toBe(0);
  });

  it("aceita ponto decimal, para quem digita pelo teclado numérico", () => {
    expect(parseMoneyInput("149.90")).toBe(149.9);
  });

  // Os DTOs da API validam `maxDecimalPlaces: 2`: mandar mais casas seria erro garantido.
  it("recusa o que não é valor válido", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("149,999")).toBeNull();
    expect(parseMoneyInput("-10")).toBeNull();
  });
});

describe("toMoneyInput", () => {
  it("devolve o valor no formato que a pessoa digitaria", () => {
    expect(toMoneyInput("149.9")).toBe("149,90");
    expect(toMoneyInput(0)).toBe("0,00");
  });

  it("faz a volta completa com parseMoneyInput", () => {
    expect(parseMoneyInput(toMoneyInput("1234.5"))).toBe(1234.5);
  });
});
