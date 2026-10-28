import { fromZonedTime } from 'date-fns-tz';
import { describe, expect, it } from 'vitest';
import {
  nextPeriod,
  periodForLabel,
  previousPeriod,
  resolvePeriod,
  resolveToday,
} from '../../src/modules/finance/period';

const TZ = 'America/Sao_Paulo';

/** Constrói o instante UTC correspondente à hora de parede informada em BRT. */
function brt(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  return fromZonedTime(new Date(year, month - 1, day, hour, minute, second, ms), TZ);
}

/**
 * Propriedade central (docs/30): para qualquer closingDay e qualquer
 * instante, o instante pertence a EXATAMENTE um período — nem dois, nem
 * zero. Também verifica que `previousPeriod`/`nextPeriod` encaixam
 * exatamente na fronteira do período resolvido, sem repetir a álgebra de
 * `resolvePeriod` no teste.
 */
function expectExactlyOnePeriod(closingDay: number, instant: Date): void {
  const period = resolvePeriod(instant, closingDay, TZ);

  expect(period.start.getTime()).toBeLessThanOrEqual(instant.getTime());
  expect(period.end.getTime()).toBeGreaterThan(instant.getTime());
  expect(period.end.getTime()).toBeGreaterThan(period.start.getTime());

  expect(nextPeriod(period, closingDay, TZ).start.getTime()).toBe(period.end.getTime());
  expect(previousPeriod(period, closingDay, TZ).end.getTime()).toBe(period.start.getTime());
}

describe('finance/period (RN-52 a RN-55, docs/30)', () => {
  describe('resolvePeriod — bateria de calendário', () => {
    it.each([
      [
        'fechamento no meio do mês',
        15,
        brt(2026, 9, 2),
        brt(2026, 8, 16),
        brt(2026, 9, 16),
        '2026-09',
      ],
      ['fechamento dia 1', 1, brt(2026, 9, 15), brt(2026, 9, 2), brt(2026, 10, 2), '2026-10'],
      [
        'fechamento dia 1, referência no próprio dia 1',
        1,
        brt(2026, 9, 1),
        brt(2026, 8, 2),
        brt(2026, 9, 2),
        '2026-09',
      ],
      ['fechamento dia 28', 28, brt(2026, 3, 10), brt(2026, 3, 1), brt(2026, 3, 29), '2026-03'],
      [
        'fechamento dia 29, fevereiro comum (satura em 28)',
        29,
        brt(2026, 2, 10),
        brt(2026, 1, 30),
        brt(2026, 3, 1),
        '2026-02',
      ],
      [
        'fechamento dia 29, fevereiro bissexto (satura em 29)',
        29,
        brt(2028, 2, 10),
        brt(2028, 1, 30),
        brt(2028, 3, 1),
        '2028-02',
      ],
      [
        'fechamento dia 30, fevereiro',
        30,
        brt(2026, 2, 10),
        brt(2026, 1, 31),
        brt(2026, 3, 1),
        '2026-02',
      ],
      [
        'fechamento dia 31, abril',
        31,
        brt(2026, 4, 10),
        brt(2026, 4, 1),
        brt(2026, 5, 1),
        '2026-04',
      ],
      [
        'fechamento dia 31, fevereiro',
        31,
        brt(2026, 2, 10),
        brt(2026, 2, 1),
        brt(2026, 3, 1),
        '2026-02',
      ],
      [
        'fechamento dia 31, virada dezembro→janeiro',
        31,
        brt(2026, 1, 5),
        brt(2026, 1, 1),
        brt(2026, 2, 1),
        '2026-01',
      ],
    ] as const)('%s', (_caso, closingDay, reference, expectedStart, expectedEnd, expectedLabel) => {
      const period = resolvePeriod(reference, closingDay, TZ);

      expect(period.start.toISOString()).toBe(expectedStart.toISOString());
      expect(period.end.toISOString()).toBe(expectedEnd.toISOString());
      expect(period.label).toBe(expectedLabel);
    });
  });

  describe('fronteira do dia de fechamento e fuso (docs/30)', () => {
    const closingDay = 15;

    it('venda às 23:59:59.999 do dia do fechamento fica DENTRO do período', () => {
      const period = resolvePeriod(brt(2026, 9, 15, 23, 59, 59, 999), closingDay, TZ);
      expect(period.label).toBe('2026-09');
    });

    it('venda às 00:00:00.000 do dia seguinte fica FORA — já é o próximo período', () => {
      const period = resolvePeriod(brt(2026, 9, 16, 0, 0, 0, 0), closingDay, TZ);
      expect(period.label).toBe('2026-10');
      expect(period.start.toISOString()).toBe(brt(2026, 9, 16).toISOString());
    });

    it('venda às 21:00 BRT do dia do fechamento (= 00:00 UTC do dia seguinte) continua DENTRO — prova o fuso', () => {
      const instant = brt(2026, 9, 15, 21, 0, 0, 0);
      // A mesma venda, se a janela fosse calculada ingenuamente em UTC, cairia
      // no dia 16 e no período errado — é exatamente isso que este caso prova.
      expect(instant.toISOString()).toBe('2026-09-16T00:00:00.000Z');

      const period = resolvePeriod(instant, closingDay, TZ);
      expect(period.label).toBe('2026-09');
      expect(period.start.getTime()).toBeLessThanOrEqual(instant.getTime());
      expect(period.end.getTime()).toBeGreaterThan(instant.getTime());
    });
  });

  describe('previousPeriod / nextPeriod', () => {
    it('nextPeriod encaixa exatamente onde o período atual termina', () => {
      const period = resolvePeriod(brt(2026, 9, 2), 15, TZ);
      const next = nextPeriod(period, 15, TZ);

      expect(next.start.getTime()).toBe(period.end.getTime());
      expect(next.label).toBe('2026-10');
    });

    it('previousPeriod encaixa exatamente onde o período atual começa', () => {
      const period = resolvePeriod(brt(2026, 9, 2), 15, TZ);
      const previous = previousPeriod(period, 15, TZ);

      expect(previous.end.getTime()).toBe(period.start.getTime());
      expect(previous.label).toBe('2026-08');
    });

    it('nextPeriod(previousPeriod(p)) e previousPeriod(nextPeriod(p)) voltam ao mesmo período', () => {
      const period = resolvePeriod(brt(2028, 2, 10), 31, TZ); // fevereiro bissexto, closingDay saturado
      const roundTripForward = previousPeriod(nextPeriod(period, 31, TZ), 31, TZ);
      const roundTripBackward = nextPeriod(previousPeriod(period, 31, TZ), 31, TZ);

      expect(roundTripForward).toEqual(period);
      expect(roundTripBackward).toEqual(period);
    });

    it('encadeados 24 vezes: sem buraco e sem sobreposição entre janelas consecutivas', () => {
      const closingDay = 31; // o mais sujeito a saturação — o caso mais provável de expor bug
      let period = resolvePeriod(brt(2026, 1, 15), closingDay, TZ);
      const chain = [period];

      for (let i = 0; i < 24; i += 1) {
        const next = nextPeriod(period, closingDay, TZ);
        expect(next.start.getTime()).toBe(period.end.getTime()); // sem buraco
        expect(next.start.getTime()).toBeLessThan(next.end.getTime()); // sem sobreposição/inversão
        chain.push(next);
        period = next;
      }

      // 24 meses fechando no dia 31 cobrem todo salto de saturação possível
      // (30, 29, 28 e o próprio 31) sem repetir nem pular um rótulo.
      const labels = chain.map((p) => p.label);
      expect(new Set(labels).size).toBe(labels.length);
    });
  });

  describe('propriedade: todo instante pertence a exatamente um período', () => {
    // Todos os closingDay possíveis (1..31, RN-53) e um dia por mês, ao meio-dia,
    // cobrindo um ano comum (2026) e um bissexto (2028).
    const closingDays = Array.from({ length: 31 }, (_, i) => i + 1);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    it.each(closingDays)(
      'closingDay=%i — meio de cada mês em ano comum e bissexto',
      (closingDay) => {
        for (const year of [2026, 2028]) {
          for (const month of months) {
            expectExactlyOnePeriod(closingDay, brt(year, month, 15, 12, 0, 0));
          }
        }
      },
    );

    it.each(closingDays)(
      'closingDay=%i — exatamente nas fronteiras (23:59:59.999 e 00:00:00.000)',
      (closingDay) => {
        for (const year of [2026, 2028]) {
          for (const month of months) {
            const period = resolvePeriod(brt(year, month, 15, 12, 0, 0), closingDay, TZ);
            expectExactlyOnePeriod(closingDay, new Date(period.end.getTime() - 1));
            expectExactlyOnePeriod(closingDay, period.end);
            expectExactlyOnePeriod(closingDay, period.start);
          }
        }
      },
    );
  });

  describe('validação', () => {
    it.each([0, 32, 1.5, Number.NaN, -1])('rejeita closingDay inválido: %s', (closingDay) => {
      expect(() => resolvePeriod(new Date(), closingDay, TZ)).toThrow(RangeError);
    });
  });

  describe('periodForLabel', () => {
    it.each([1, 15, 28, 29, 30, 31])(
      'devolve o período cujo label é exatamente o pedido, para closingDay=%i',
      (closingDay) => {
        for (const [year, month] of [
          [2026, 1],
          [2026, 2],
          [2026, 9],
          [2026, 12],
          [2028, 2], // fevereiro bissexto
        ] as const) {
          const label = `${year}-${String(month).padStart(2, '0')}`;
          const period = periodForLabel(label, closingDay, TZ);

          expect(period.label).toBe(label);
          expect(period.start.getTime()).toBeLessThan(period.end.getTime());

          // O que a função usa por baixo (dia 1 do mês-alvo) tem que cair
          // dentro da própria janela devolvida — senão o label mentiria.
          const day1 = brt(year, month, 1, 12, 0, 0);
          expect(period.start.getTime()).toBeLessThanOrEqual(day1.getTime());
          expect(period.end.getTime()).toBeGreaterThan(day1.getTime());

          // E tem que ser exatamente o que resolvePeriod encontra a partir
          // dessa mesma referência — periodForLabel não pode divergir dele.
          expect(period).toEqual(resolvePeriod(day1, closingDay, TZ));
        }
      },
    );

    it('rejeita formato inválido', () => {
      expect(() => periodForLabel('2026-9', 15, TZ)).toThrow(RangeError);
      expect(() => periodForLabel('26-09', 15, TZ)).toThrow(RangeError);
      expect(() => periodForLabel('2026-13', 15, TZ)).toThrow(RangeError);
      expect(() => periodForLabel('2026-00', 15, TZ)).toThrow(RangeError);
      expect(() => periodForLabel('not-a-period', 15, TZ)).toThrow(RangeError);
    });
  });

  describe('resolveToday (docs/21, RN-61)', () => {
    it('meio-dia em BRT resolve para a meia-noite do mesmo dia em BRT', () => {
      const noon = brt(2026, 9, 15, 12, 0, 0);
      expect(resolveToday(noon, TZ).getTime()).toBe(brt(2026, 9, 15, 0, 0, 0).getTime());
    });

    it('perto da virada: 23h de BRT já é o dia seguinte em UTC, mas "hoje" continua o dia local', () => {
      // 15/09 23:00 em São Paulo é 16/09 02:00 em UTC — resolveToday não
      // pode confundir o fuso do banco com o fuso da empresa.
      const lateNight = brt(2026, 9, 15, 23, 0, 0);
      expect(resolveToday(lateNight, TZ).getTime()).toBe(brt(2026, 9, 15, 0, 0, 0).getTime());
    });

    it('já é meia-noite: resolve para o mesmo instante', () => {
      const midnight = brt(2026, 9, 15, 0, 0, 0);
      expect(resolveToday(midnight, TZ).getTime()).toBe(midnight.getTime());
    });

    it('um instante antes da meia-noite ainda é o dia anterior', () => {
      const almostMidnight = new Date(brt(2026, 9, 15, 0, 0, 0).getTime() - 1);
      expect(resolveToday(almostMidnight, TZ).getTime()).toBe(brt(2026, 9, 14, 0, 0, 0).getTime());
    });
  });
});
