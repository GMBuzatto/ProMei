/**
 * CNPJ: normalização, máscara e validação de dígitos verificadores.
 *
 * A API guarda `document` como string única (`@unique`) de até 32 caracteres e não impõe
 * formato. Por isso o front **normaliza para dígitos** antes de enviar: se um cadastro
 * fosse com pontuação e outro sem, o banco aceitaria os dois como empresas diferentes e a
 * unicidade viraria ficção. A máscara existe só na tela.
 *
 * A validação de dígitos é UX — quem manda é a API (docs/09-seguranca.md).
 */

const CNPJ_LENGTH = 14;

/** Dígitos e os separadores da máscara — o que um CNPJ digitado pode conter. */
const CNPJ_SHAPED = /^[\d./\s-]*$/;

/**
 * `true` quando o valor tem cara de CNPJ (dígitos, com ou sem máscara).
 *
 * A API aceita qualquer string de até 32 caracteres em `document`, e a base tem documentos
 * que não são CNPJ — os do seed, por exemplo. Máscara e normalização assumem dígitos: sobre
 * um documento com letras elas apagariam caracteres, e um "salvar" reescreveria o dado.
 * Quem formata ou normaliza pergunta aqui antes.
 */
export function isCnpjShaped(value: string): boolean {
  return CNPJ_SHAPED.test(value);
}

/** Só os dígitos, que é a forma como o documento é persistido e comparado. */
export function normalizeDocument(value: string): string {
  return value.replace(/\D/g, "").slice(0, CNPJ_LENGTH);
}

/** Aplica a máscara 00.000.000/0000-00 progressivamente, para uso durante a digitação. */
export function formatDocument(value: string): string {
  const digits = normalizeDocument(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/**
 * Dígito verificador do CNPJ: soma ponderada percorrendo da direita para a esquerda com
 * pesos 2, 3, 4... que voltam a 2 depois do 9.
 */
function checkDigit(digits: string, length: number): number {
  let weight = 2;
  let sum = 0;

  for (let index = length - 1; index >= 0; index -= 1) {
    sum += Number(digits[index]) * weight;
    weight += 1;
    if (weight > 9) weight = 2;
  }

  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value: string): boolean {
  const digits = normalizeDocument(value);
  if (digits.length !== CNPJ_LENGTH) return false;

  // Sequências repetidas (00000000000000, 11111111111111...) passam na conta mas não existem.
  if (new Set(digits).size === 1) return false;

  return (
    checkDigit(digits, 12) === Number(digits[12]) && checkDigit(digits, 13) === Number(digits[13])
  );
}

/**
 * `true` quando vale consultar a disponibilidade do CNPJ na API.
 *
 * Só documento completo e com dígitos válidos — consultar prefixo inválido gastaria
 * requisição para uma resposta que não significa nada. E, na edição, o documento atual da
 * própria empresa está "ocupado" por ela mesma: perguntar por ele acusaria duplicidade
 * onde não há.
 */
export function shouldCheckDocumentAvailability(
  document: string,
  currentDocument?: string,
): boolean {
  const normalized = normalizeDocument(document);
  if (!isValidCnpj(normalized)) return false;
  return normalized !== normalizeDocument(currentDocument ?? "");
}

/**
 * Documento como ele deve aparecer na tela: com máscara quando tem cara de CNPJ, cru quando
 * não tem. Sem isso, um documento fora do padrão apareceria mutilado — a máscara descarta o
 * que não for dígito, e o usuário leria um número que não é o do registro.
 */
export function displayDocument(value: string): string {
  return isCnpjShaped(value) ? formatDocument(value) : value;
}
