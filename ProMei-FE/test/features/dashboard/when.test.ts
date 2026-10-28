import { describe, expect, it } from "vitest";
import { whenLabel } from "@/features/dashboard/when";

/** Datas montadas no fuso local, que é o mesmo em que a tela formata. */
function local(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

describe("whenLabel", () => {
  const now = local(2026, 8, 26, 15, 0);

  it("diz hoje com a hora", () => {
    expect(whenLabel(local(2026, 8, 26, 14, 32).toISOString(), now)).toBe("hoje, 14:32");
  });

  it("diz ontem com a hora", () => {
    expect(whenLabel(local(2026, 8, 25, 18, 40).toISOString(), now)).toBe("ontem, 18:40");
  });

  // Dia de calendário, não 24h: 23h50 de ontem continua sendo "ontem" às 00h10 de hoje.
  it("separa por virada de dia, não por horas decorridas", () => {
    const madrugada = local(2026, 8, 26, 0, 10);

    expect(whenLabel(local(2026, 8, 25, 23, 50).toISOString(), madrugada)).toBe("ontem, 23:50");
  });

  it("volta para a data quando passa de ontem", () => {
    expect(whenLabel(local(2026, 8, 10, 11, 5).toISOString(), now)).toBe("10/08, 11:05");
  });

  it("mostra a data quando o relógio do cliente está adiantado", () => {
    expect(whenLabel(local(2026, 8, 28, 9, 0).toISOString(), now)).toBe("28/08, 09:00");
  });
});
