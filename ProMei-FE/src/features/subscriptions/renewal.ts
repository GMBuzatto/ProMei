/**
 * Datas de renovação da assinatura: da API para a tela e da tela para a API.
 *
 * Sem React e sem rede, para poder ser testado sozinho — e porque é a parte que erra em
 * silêncio, arrastando fuso horário para dentro de uma coluna que é só data.
 */

/**
 * Dias até a primeira renovação quando a assinatura é criada pelo painel.
 *
 * Espelha o `nextRenewalDate()` da API, usada quando a empresa é provisionada já com plano:
 * vincular o plano depois não pode dar um vencimento diferente de vincular na criação.
 */
export const DEFAULT_RENEWAL_DAYS = 30;

/** `YYYY-MM-DD` no fuso local — formato que `<input type="date">` aceita e devolve. */
export function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Data sugerida de renovação: hoje + {@link DEFAULT_RENEWAL_DAYS}. */
export function defaultRenewalDate(from: Date = new Date()): string {
  const date = new Date(from);
  date.setDate(date.getDate() + DEFAULT_RENEWAL_DAYS);
  return toDateInputValue(date);
}

/**
 * `renewsAt` da API (`2026-09-24T00:00:00.000Z`) para o valor do `<input type="date">`.
 *
 * O corte é feito na string, e não com `new Date().getDate()`: a API guarda `@db.Date` e
 * serializa à meia-noite UTC — converter para o fuso local voltaria um dia em todo o Brasil.
 */
export function renewalDateToInputValue(iso: string): string {
  return iso.slice(0, 10);
}

/** Renovação por extenso, sem passar pelo fuso local (mesma razão de cima). */
export function formatRenewalDate(iso: string): string {
  const [year, month, day] = renewalDateToInputValue(iso).split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}
