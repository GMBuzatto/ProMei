/**
 * Período financeiro (docs/20, RN-52 a RN-55).
 *
 * Função pura: sem banco, sem `Date.now()` interno — a data de referência
 * SEMPRE entra por parâmetro. É o que torna testável "o que acontece em
 * 29/02/2028" sem viajar no tempo.
 *
 * O período é `[dia seguinte ao fechamento anterior, dia do fechamento]`,
 * calculado no fuso da empresa e devolvido como intervalo semiaberto
 * `[start, end)` em UTC — um instante pertence a exatamente um período;
 * intervalo fechado nos dois lados faria a venda da meia-noite do dia do
 * fechamento contar duas vezes.
 *
 * `closingDay` maior que o número de dias do mês satura no último dia do mês,
 * nas duas pontas da janela (RN-53).
 */

import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export interface FinancialPeriod {
  /** Rótulo estável: o ano-mês do FIM do período (o mês do fechamento). Ex.: "2026-09". */
  label: string;
  /** Inclusivo, em UTC. */
  start: Date;
  /** EXCLUSIVO, em UTC. */
  end: Date;
}

/** Data de calendário "nua" — sem fuso, sem hora. Só existe dentro deste módulo. */
interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

function assertValidClosingDay(closingDay: number): void {
  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
    throw new RangeError(`closingDay precisa ser um inteiro entre 1 e 31; recebeu ${closingDay}.`);
  }
}

/**
 * Toda a aritmética de calendário abaixo (dias no mês, soma de dias/meses)
 * usa `Date.UTC`/getters `getUTC*`, nunca o construtor local (`new Date(y,m,d)`)
 * nem `date-fns` puro (que lê/escreve com getters locais). Não é sobre o fuso
 * DA EMPRESA — é para a conta em si não depender do fuso do PROCESSO que roda
 * o código: um dia em UTC sempre tem 24h exatas, sem horário de verão para
 * pular ou repetir uma data. O cruzamento com o fuso real da empresa acontece
 * só nas duas funções de fronteira (`wallClockOf` / `toInstant`), que usam
 * `date-fns-tz` como a decisão de arquitetura manda (PD-10).
 */
function daysInMonth(year: number, month: number): number {
  // Dia 0 do mês seguinte = último dia deste mês.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function saturateDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

function addCalendarMonths(date: CalendarDate, delta: number): CalendarDate {
  const total = date.month - 1 + delta;
  const year = date.year + Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  return { year, month, day: date.day };
}

function addCalendarDays(date: CalendarDate, delta: number): CalendarDate {
  const instant = new Date(Date.UTC(date.year, date.month - 1, date.day) + delta * 86_400_000);
  return {
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
  };
}

/**
 * Data de calendário (wall clock) que `instant` representa no fuso da
 * empresa. `toZonedTime` devolve um `Date` cujos getters LOCAIS (do
 * processo) — não os `getUTC*` — mostram a hora no fuso pedido; é assim que
 * a biblioteca funciona (`date-fns-tz` v3), e o resultado independe do fuso
 * em que o processo roda (testado sob `TZ=UTC` e sob `America/Sao_Paulo`).
 */
function wallClockOf(instant: Date, timeZone: string): CalendarDate {
  const zoned = toZonedTime(instant, timeZone);
  return { year: zoned.getFullYear(), month: zoned.getMonth() + 1, day: zoned.getDate() };
}

/** Instante UTC correspondente à meia-noite de `date` no fuso da empresa. */
function toInstant(date: CalendarDate, timeZone: string): Date {
  // Construtor LOCAL de propósito: `fromZonedTime` lê os getters locais do
  // Date recebido como se fossem a hora de parede no fuso informado — o
  // espelho exato de como `toZonedTime` escreve o resultado acima.
  const wallClock = new Date(date.year, date.month - 1, date.day, 0, 0, 0, 0);
  return fromZonedTime(wallClock, timeZone);
}

function formatLabel(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}`;
}

/**
 * Meia-noite de "hoje" no fuso da empresa, como instante UTC (docs/21,
 * RN-61). `customer-status.policy.ts#decideCustomerFinancialStatus` e a
 * validação de `dueDate` na criação da venda dependem de "hoje" resolvido
 * assim — nunca de `due_date < timestamptz_agora` cru, que confundiria
 * fuso do banco com fuso da empresa.
 *
 * @param reference instante qualquer do dia que deve ser considerado "hoje"
 */
export function resolveToday(reference: Date, timeZone: string): Date {
  return toInstant(wallClockOf(reference, timeZone), timeZone);
}

/** Dia de fechamento efetivo do mês `{year, month}`, já saturado (RN-53). */
function effectiveClosingDay(year: number, month: number, closingDay: number): CalendarDate {
  return { year, month, day: saturateDay(year, month, closingDay) };
}

/**
 * Resolve o período financeiro que contém `reference`.
 *
 * @param reference instante qualquer dentro do período desejado
 * @param closingDay dia de fechamento da empresa, 1..31
 * @param timeZone fuso IANA da empresa (ex.: "America/Sao_Paulo")
 */
export function resolvePeriod(
  reference: Date,
  closingDay: number,
  timeZone: string,
): FinancialPeriod {
  assertValidClosingDay(closingDay);

  const wallClock = wallClockOf(reference, timeZone);
  const closingThisMonth = effectiveClosingDay(wallClock.year, wallClock.month, closingDay);

  // `reference` fecha no mês corrente se ainda não passou do dia de
  // fechamento (efetivo/saturado) deste mês; senão, fecha no mês seguinte.
  const end = (() => {
    if (wallClock.day <= closingThisMonth.day) return closingThisMonth;
    const nextMonth = addCalendarMonths(wallClock, 1);
    return effectiveClosingDay(nextMonth.year, nextMonth.month, closingDay);
  })();

  const previousMonth = addCalendarMonths(end, -1);
  const closingPreviousMonth = effectiveClosingDay(
    previousMonth.year,
    previousMonth.month,
    closingDay,
  );
  const start = addCalendarDays(closingPreviousMonth, 1);

  return {
    label: formatLabel(end),
    start: toInstant(start, timeZone),
    end: toInstant(addCalendarDays(end, 1), timeZone),
  };
}

/**
 * Período imediatamente anterior a `period`.
 *
 * Resolve 1ms antes do início: qualquer instante ali pertence, por
 * construção, ao período anterior — sem repetir a álgebra de calendário de
 * `resolvePeriod`.
 */
export function previousPeriod(
  period: FinancialPeriod,
  closingDay: number,
  timeZone: string,
): FinancialPeriod {
  return resolvePeriod(new Date(period.start.getTime() - 1), closingDay, timeZone);
}

/**
 * Período imediatamente seguinte a `period`.
 *
 * `period.end` já É o início do próximo período (intervalo semiaberto): o
 * mesmo instante que fecha um período abre o outro.
 */
export function nextPeriod(
  period: FinancialPeriod,
  closingDay: number,
  timeZone: string,
): FinancialPeriod {
  return resolvePeriod(period.end, closingDay, timeZone);
}

/**
 * Resolve o período cujo `label` é `label` (formato `"YYYY-MM"`, o mesmo de
 * `FinancialPeriod.label` — usado por `GET .../financial-summary?period=`).
 *
 * Usa o dia 1 do mês-alvo como referência: para qualquer `closingDay`
 * (1..31), o dia 1 de um mês SEMPRE fecha nesse mesmo mês — a saturação
 * nunca empurra o fechamento de um dia 1 para o mês seguinte, porque o dia
 * de fechamento efetivo de qualquer mês é sempre >= 1. Então o período
 * resolvido a partir do dia 1 tem, garantidamente, o label pedido.
 */
export function periodForLabel(
  label: string,
  closingDay: number,
  timeZone: string,
): FinancialPeriod {
  const match = /^(\d{4})-(\d{2})$/.exec(label);
  if (!match) {
    throw new RangeError(`period precisa estar no formato YYYY-MM; recebeu "${label}".`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new RangeError(`period precisa estar no formato YYYY-MM; recebeu "${label}".`);
  }

  const reference = toInstant({ year, month, day: 1 }, timeZone);
  return resolvePeriod(reference, closingDay, timeZone);
}
