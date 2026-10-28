import { describe, expect, it } from "vitest";
import {
  DEFAULT_RENEWAL_DAYS,
  defaultRenewalDate,
  formatRenewalDate,
  renewalDateToInputValue,
  toDateInputValue,
} from "@/features/subscriptions/renewal";

describe("toDateInputValue", () => {
  it("usa o fuso local com mês e dia sempre em dois dígitos", () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("defaultRenewalDate", () => {
  it("sugere hoje + 30 dias, como a API faz ao provisionar com plano", () => {
    expect(defaultRenewalDate(new Date(2026, 7, 25))).toBe("2026-09-24");
    expect(DEFAULT_RENEWAL_DAYS).toBe(30);
  });

  it("atravessa a virada do ano", () => {
    expect(defaultRenewalDate(new Date(2026, 11, 20))).toBe("2027-01-19");
  });
});

describe("renewalDateToInputValue", () => {
  // A API serializa `@db.Date` à meia-noite UTC: converter para o fuso local
  // (UTC-3 no Brasil) voltaria um dia.
  it("corta a data da string sem passar pelo fuso local", () => {
    expect(renewalDateToInputValue("2026-09-24T00:00:00.000Z")).toBe("2026-09-24");
  });
});

describe("formatRenewalDate", () => {
  it("exibe no formato brasileiro", () => {
    expect(formatRenewalDate("2026-09-24T00:00:00.000Z")).toBe("24/09/2026");
  });
});
