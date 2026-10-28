import { describe, expect, it } from "vitest";
import { formatPriceWithPeriod, periodLabel, periodSuffix } from "@/features/plans/format";

describe("periodLabel / periodSuffix", () => {
  it("traduz os períodos que a API aceita", () => {
    expect(periodLabel("monthly")).toBe("Mensal");
    expect(periodLabel("yearly")).toBe("Anual");
    expect(periodSuffix("monthly")).toBe("/mês");
  });

  // Período novo no back-end não pode sumir da tela.
  it("mostra período desconhecido como veio", () => {
    expect(periodLabel("weekly")).toBe("weekly");
    expect(periodSuffix("weekly")).toBe("weekly");
  });
});

describe("formatPriceWithPeriod", () => {
  it("junta preço e período", () => {
    expect(formatPriceWithPeriod({ price: "49.9", period: "monthly" })).toMatch(/49,90 \/mês/);
  });
});
