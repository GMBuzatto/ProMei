import { describe, expect, it } from "vitest";
import { findCompanyByDocument, summarizeCompanies } from "@/features/companies/stats";
import type { Company, CompanyStatus } from "@/features/companies/types";

function company(status: CompanyStatus, id = crypto.randomUUID()): Company {
  return {
    id,
    name: `Empresa ${id.slice(0, 4)}`,
    document: "00000000000191",
    status,
    segment: "OTHER",
    createdAt: "2026-05-12T14:32:00.000Z",
    updatedAt: "2026-05-20T08:10:00.000Z",
  };
}

describe("summarizeCompanies", () => {
  it("conta cada estado separadamente", () => {
    const stats = summarizeCompanies(
      [
        company("ACTIVE"),
        company("ACTIVE"),
        company("SUSPENDED"),
        company("CANCELED"),
        company("CANCELED"),
        company("CANCELED"),
      ],
      6,
    );

    expect(stats.byStatus).toEqual({ ACTIVE: 2, SUSPENDED: 1, CANCELED: 3 });
    expect(stats.scanned).toBe(6);
    expect(stats.total).toBe(6);
    expect(stats.partial).toBe(false);
  });

  it("devolve zeros quando não há empresa", () => {
    const stats = summarizeCompanies([], 0);

    expect(stats.byStatus).toEqual({ ACTIVE: 0, SUSPENDED: 0, CANCELED: 0 });
    expect(stats.scanned).toBe(0);
  });

  it("mantém o total da API mesmo quando a varredura é parcial", () => {
    // O total geral continua exato; só a quebra por estado é que fica incompleta.
    const stats = summarizeCompanies([company("ACTIVE"), company("SUSPENDED")], 500, true);

    expect(stats.total).toBe(500);
    expect(stats.scanned).toBe(2);
    expect(stats.partial).toBe(true);
  });

  it("ignora status desconhecido em vez de contá-lo no balde errado", () => {
    // Cenário real de deploy defasado: API já devolve um estado novo que este front
    // não conhece. Somar no lugar errado seria pior do que não somar.
    const desconhecida = { ...company("ACTIVE"), status: "ARCHIVED" as CompanyStatus };
    const stats = summarizeCompanies([company("ACTIVE"), desconhecida], 2);

    expect(stats.byStatus).toEqual({ ACTIVE: 1, SUSPENDED: 0, CANCELED: 0 });
    expect(stats.total).toBe(2);
  });

  it("a soma por estado nunca ultrapassa o que foi varrido", () => {
    const companies = [company("ACTIVE"), company("SUSPENDED"), company("CANCELED")];
    const stats = summarizeCompanies(companies, 3);
    const soma = Object.values(stats.byStatus).reduce((acc, value) => acc + value, 0);

    expect(soma).toBeLessThanOrEqual(stats.scanned);
  });
});

describe("findCompanyByDocument", () => {
  const directory = {
    companies: [company("ACTIVE", "11111111-1111-1111-1111-111111111111")],
    total: 1,
    partial: false,
  };

  it("acha a empresa comparando só os dígitos, com ou sem máscara", () => {
    expect(findCompanyByDocument(directory, "00000000000191")?.document).toBe("00000000000191");
    expect(findCompanyByDocument(directory, "00.000.000/0001-91")?.document).toBe("00000000000191");
  });

  it("devolve undefined quando o documento não está entre os carregados", () => {
    expect(findCompanyByDocument(directory, "11222333000181")).toBeUndefined();
  });

  it("não casa com documento vazio", () => {
    expect(findCompanyByDocument({ ...directory, companies: [] }, "")).toBeUndefined();
    expect(findCompanyByDocument(directory, "")).toBeUndefined();
  });
});
