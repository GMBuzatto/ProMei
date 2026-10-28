/**
 * Como o dashboard fala de tempo.
 *
 * "Movimentações recentes" é uma lista curta do que acabou de acontecer: quem lê quer saber
 * se foi agora, mais cedo ou outro dia — não a data por extenso. Por isso o dia vira "hoje"
 * ou "ontem" e só depois disso cede lugar à data.
 */

const MS_PER_DAY = 86_400_000;

/** Diferença em dias de **calendário**, não em horas: 23h50 e 00h10 são dias diferentes. */
function calendarDaysBetween(date: Date, now: Date): number {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return Math.round((today.getTime() - day.getTime()) / MS_PER_DAY);
}

export function whenLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const days = calendarDaysBetween(date, now);

  if (days === 0) return `hoje, ${time}`;
  if (days === 1) return `ontem, ${time}`;

  // Inclui datas no futuro (relógio do cliente adiantado): "amanhã" seria mentira mais
  // confusa que a data crua.
  return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${time}`;
}
