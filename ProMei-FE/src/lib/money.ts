/**
 * Dinheiro entre a API e a tela.
 *
 * A API serializa `Decimal` como **string** para não perder precisão, e a pessoa digita valor
 * em pt-BR — com vírgula decimal. As duas conversões erram em silêncio quando feitas na mão
 * (`Number("149,90")` é `NaN`, `"149.9"` impresso cru vira "149.9" num painel em português),
 * então moram aqui, num lugar só, testadas.
 */

/** Valor em reais, para leitura. Devolve a entrada como veio quando não é número. */
export function formatMoney(value: string | number): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return String(value);

  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Valor digitado → número que a API aceita.
 *
 * Aceita vírgula decimal e os pontos de milhar, porque é assim que se digita preço em pt-BR.
 * `null` quando não dá para ler um número — o schema transforma isso em erro de campo, em vez
 * de mandar `NaN` para a API.
 */
export function parseMoneyInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  // "1.234,56" → "1234.56"; "1234.56" continua válido quando não há vírgula.
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;

  // Duas casas no máximo: é o que `Decimal(10,2)` guarda e o que os DTOs validam.
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

/** Número da API → texto do campo, no formato que a pessoa digitaria. */
export function toMoneyInput(value: string | number): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return String(value);

  return amount.toFixed(2).replace(".", ",");
}
