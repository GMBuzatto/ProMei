/**
 * Geração do SKU automático do item (RN-25: "SKU é gerado automaticamente se
 * não informado").
 *
 * Formato: `<prefixo>-<sequencial zero-padded>` (ex.: `ITM-000001`). Prefixo e
 * padding vêm de env (docs/16), nunca de constante fixa.
 *
 * O padding fixo não é enfeite: com todos os sufixos do mesmo tamanho, a ordem
 * lexicográfica do banco coincide com a numérica, e descobrir o último
 * sequencial vira um `ORDER BY sku DESC LIMIT 1` em vez de varrer a tabela.
 */

export const SKU_SEPARATOR = '-';

/** Monta o SKU a partir do sequencial. Sequencial maior que o padding não é truncado. */
export function buildSku(prefix: string, sequence: number, padding: number): string {
  return `${prefix}${SKU_SEPARATOR}${String(sequence).padStart(padding, '0')}`;
}

/**
 * Extrai o sequencial de um SKU gerado por `buildSku`.
 *
 * Devolve `null` para SKU informado pelo usuário (`PARAF-001`, `abc`), que não
 * participa da sequência automática — só o que casa exatamente com o prefixo e
 * tem sufixo puramente numérico conta.
 */
export function parseSkuSequence(sku: string, prefix: string): number | null {
  const expectedStart = `${prefix}${SKU_SEPARATOR}`;

  if (!sku.startsWith(expectedStart)) return null;

  const suffix = sku.slice(expectedStart.length);

  // `Number('')` é 0 e `Number(' 1')` é 1 — ambos passariam batido sem isto.
  if (!/^\d+$/.test(suffix)) return null;

  const sequence = Number(suffix);

  return Number.isSafeInteger(sequence) ? sequence : null;
}
