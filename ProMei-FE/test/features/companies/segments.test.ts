import { describe, expect, it } from "vitest";
import { DEFAULT_NICHE, isNicheKey } from "@/lib/niches";
import {
  hasDedicatedTheme,
  nicheForSegment,
  SEGMENT_META,
  segmentLabel,
} from "@/features/companies/segments";
import { COMPANY_SEGMENTS, isCompanySegment, isCompanyStatus } from "@/features/companies/types";

describe("SEGMENT_META", () => {
  it("cobre todos os segmentos que a API pode devolver", () => {
    for (const segment of COMPANY_SEGMENTS) {
      expect(SEGMENT_META[segment]).toBeDefined();
      expect(SEGMENT_META[segment].label.length).toBeGreaterThan(0);
    }
  });

  it("só aponta para nichos que existem no registro de temas", () => {
    // Um nicho inexistente aqui viraria um data-niche sem bloco CSS — o preview
    // renderizaria a paleta default sem ninguém perceber o erro.
    for (const segment of COMPANY_SEGMENTS) {
      expect(isNicheKey(SEGMENT_META[segment].niche)).toBe(true);
    }
  });
});

describe("nicheForSegment", () => {
  it("mapeia os segmentos com paleta própria", () => {
    expect(nicheForSegment("FOOD")).toBe("alimenticio");
    expect(nicheForSegment("HEALTH")).toBe("saude");
  });

  it("cai no nicho padrão para segmentos sem paleta definida", () => {
    expect(nicheForSegment("RETAIL")).toBe(DEFAULT_NICHE);
    expect(nicheForSegment("SERVICES")).toBe(DEFAULT_NICHE);
    expect(nicheForSegment("OTHER")).toBe(DEFAULT_NICHE);
  });
});

describe("hasDedicatedTheme", () => {
  it("distingue quem tem paleta própria de quem usa a padrão", () => {
    expect(hasDedicatedTheme("FOOD")).toBe(true);
    expect(hasDedicatedTheme("HEALTH")).toBe(true);
    expect(hasDedicatedTheme("RETAIL")).toBe(false);
    expect(hasDedicatedTheme("OTHER")).toBe(false);
  });
});

describe("segmentLabel", () => {
  it("devolve o rótulo em pt-BR", () => {
    expect(segmentLabel("FOOD")).toBe("Alimentício");
    expect(segmentLabel("HEALTH")).toBe("Saúde");
    expect(segmentLabel("RETAIL")).toBe("Varejo");
  });
});

describe("guards de enum", () => {
  it("isCompanySegment aceita só valores da API", () => {
    expect(isCompanySegment("FOOD")).toBe(true);
    expect(isCompanySegment("food")).toBe(false);
    expect(isCompanySegment("TECH")).toBe(false);
    expect(isCompanySegment(null)).toBe(false);
  });

  it("isCompanyStatus aceita só valores da API", () => {
    expect(isCompanyStatus("ACTIVE")).toBe(true);
    expect(isCompanyStatus("PAST_DUE")).toBe(false);
    expect(isCompanyStatus(undefined)).toBe(false);
  });
});
