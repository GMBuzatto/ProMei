import { describe, expect, it } from "vitest";
import type { Company } from "@/features/companies/types";
import type { Subscription } from "@/features/subscriptions/types";
import {
  fetchPlanSubscribers,
  MAX_COMPANIES_INSPECTED,
  sortByRenewal,
  subscribersOfPlan,
} from "@/features/plans/subscribers";

const PLAN = "11111111-1111-1111-1111-111111111111";
const OTHER_PLAN = "22222222-2222-2222-2222-222222222222";

function company(name: string, id = crypto.randomUUID()): Company {
  return {
    id,
    name,
    document: "00000000000191",
    status: "ACTIVE",
    segment: "RETAIL",
    createdAt: "2026-01-10T12:00:00.000Z",
    updatedAt: "2026-01-10T12:00:00.000Z",
  };
}

function subscription(companyId: string, renewsAt: string, planId = PLAN): Subscription {
  return {
    id: crypto.randomUUID(),
    companyId,
    planId,
    status: "ACTIVE",
    renewsAt,
    createdAt: "2026-01-10T12:00:00.000Z",
    updatedAt: "2026-01-10T12:00:00.000Z",
  };
}

function entry(name: string, renewsAt: string, planId = PLAN) {
  const target = company(name);
  return { company: target, subscription: subscription(target.id, renewsAt, planId) };
}

describe("sortByRenewal", () => {
  // O exemplo do aceite: A (28/08) → B (10/09) → C (15/12).
  it("põe a renovação mais próxima primeiro", () => {
    const ordered = sortByRenewal([
      entry("Empresa C", "2026-12-15T00:00:00.000Z"),
      entry("Empresa A", "2026-08-28T00:00:00.000Z"),
      entry("Empresa B", "2026-09-10T00:00:00.000Z"),
    ]);

    expect(ordered.map((item) => item.company.name)).toEqual([
      "Empresa A",
      "Empresa B",
      "Empresa C",
    ]);
  });

  it("ordena corretamente na virada do ano", () => {
    const ordered = sortByRenewal([
      entry("Março", "2027-03-01T00:00:00.000Z"),
      entry("Dezembro", "2026-12-31T00:00:00.000Z"),
      entry("Janeiro", "2027-01-01T00:00:00.000Z"),
    ]);

    expect(ordered.map((item) => item.company.name)).toEqual(["Dezembro", "Janeiro", "Março"]);
  });

  // Datas vizinhas seriam trocadas se a comparação passasse pelo fuso local (UTC-3).
  it("não deixa o fuso local trocar dias seguidos", () => {
    const ordered = sortByRenewal([
      entry("Dia 2", "2026-09-02T00:00:00.000Z"),
      entry("Dia 1", "2026-09-01T00:00:00.000Z"),
    ]);

    expect(ordered.map((item) => item.company.name)).toEqual(["Dia 1", "Dia 2"]);
  });

  it("desempata por nome para a ordem não variar entre carregamentos", () => {
    const ordered = sortByRenewal([
      entry("Zeta", "2026-09-10T00:00:00.000Z"),
      entry("Alfa", "2026-09-10T00:00:00.000Z"),
    ]);

    expect(ordered.map((item) => item.company.name)).toEqual(["Alfa", "Zeta"]);
  });

  it("não altera o array recebido", () => {
    const input = [
      entry("Segunda", "2026-10-10T00:00:00.000Z"),
      entry("Primeira", "2026-09-10T00:00:00.000Z"),
    ];
    const names = input.map((item) => item.company.name);

    sortByRenewal(input);

    expect(input.map((item) => item.company.name)).toEqual(names);
  });
});

describe("subscribersOfPlan", () => {
  it("fica só com as empresas vinculadas ao plano selecionado", () => {
    const selected = subscribersOfPlan(
      [
        entry("Do plano", "2026-09-10T00:00:00.000Z"),
        entry("De outro plano", "2026-08-01T00:00:00.000Z", OTHER_PLAN),
      ],
      PLAN,
    );

    expect(selected.map((item) => item.company.name)).toEqual(["Do plano"]);
  });

  it("ignora empresa sem assinatura", () => {
    const semAssinatura = { company: company("Sem plano"), subscription: null };
    const selected = subscribersOfPlan(
      [semAssinatura, entry("Com plano", "2026-09-10T00:00:00.000Z")],
      PLAN,
    );

    expect(selected).toHaveLength(1);
  });

  it("devolve lista vazia quando ninguém assina o plano", () => {
    const selected = subscribersOfPlan(
      [entry("De outro plano", "2026-08-01T00:00:00.000Z", OTHER_PLAN)],
      PLAN,
    );

    expect(selected).toEqual([]);
  });
});

describe("fetchPlanSubscribers", () => {
  function loaders(entries: ReturnType<typeof entry>[], directoryOverrides = {}) {
    const companies = entries.map((item) => item.company);
    const byCompany = new Map(entries.map((item) => [item.company.id, item.subscription]));

    return {
      loadDirectory: async () => ({
        companies,
        total: companies.length,
        partial: false,
        ...directoryOverrides,
      }),
      loadSubscription: async (companyId: string) => byCompany.get(companyId) ?? null,
    };
  }

  it("devolve os assinantes do plano já ordenados", async () => {
    const result = await fetchPlanSubscribers(
      PLAN,
      loaders([
        entry("Empresa C", "2026-12-15T00:00:00.000Z"),
        entry("Empresa A", "2026-08-28T00:00:00.000Z"),
        entry("De outro plano", "2026-01-01T00:00:00.000Z", OTHER_PLAN),
      ]),
    );

    expect(result.subscribers.map((item) => item.company.name)).toEqual(["Empresa A", "Empresa C"]);
    expect(result.inspected).toBe(3);
    expect(result.partial).toBe(false);
  });

  // A API limita 100 requisições por minuto: passar do teto derrubaria a sessão em 429.
  it("para no teto de empresas consultadas e marca o resultado como parcial", async () => {
    const many = Array.from({ length: MAX_COMPANIES_INSPECTED + 5 }, (_, index) =>
      entry(`Empresa ${index}`, "2026-09-10T00:00:00.000Z"),
    );

    const result = await fetchPlanSubscribers(PLAN, loaders(many));

    expect(result.inspected).toBe(MAX_COMPANIES_INSPECTED);
    expect(result.partial).toBe(true);
  });

  it("conta a empresa ilegível em vez de derrubar a lista", async () => {
    const ok = entry("Empresa boa", "2026-09-10T00:00:00.000Z");
    const broken = entry("Empresa quebrada", "2026-09-11T00:00:00.000Z");

    const result = await fetchPlanSubscribers(PLAN, {
      loadDirectory: async () => ({
        companies: [ok.company, broken.company],
        total: 2,
        partial: false,
      }),
      loadSubscription: async (companyId: string) => {
        if (companyId === broken.company.id) throw new Error("403");
        return ok.subscription;
      },
    });

    expect(result.subscribers.map((item) => item.company.name)).toEqual(["Empresa boa"]);
    expect(result.failed).toBe(1);
  });

  it("propaga a varredura parcial de empresas", async () => {
    const result = await fetchPlanSubscribers(
      PLAN,
      loaders([entry("Empresa A", "2026-09-10T00:00:00.000Z")], { partial: true, total: 5000 }),
    );

    expect(result.partial).toBe(true);
    expect(result.total).toBe(5000);
  });
});
