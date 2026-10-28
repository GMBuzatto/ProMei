import { MIN_PASSWORD_LENGTH } from "@/features/auth/schemas";

/**
 * Senha temporária gerada pela tela (RF-04: sem e-mail no MVP).
 *
 * Quem cadastra o colega precisa **entregar uma senha a ele**, e a API exige uma no corpo do
 * `POST /users`. Deixar o Admin inventar produz "123456789012" — e ela vale até o primeiro
 * acesso, quando a troca é obrigatória de qualquer forma.
 *
 * Sem caracteres ambíguos (`O/0`, `l/1/I`) de propósito: esta senha vai ser ditada por
 * telefone ou copiada de um bilhete, e um zero confundido com "ó" vira suporte.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Folga sobre o mínimo da API (12): a senha é temporária, mas trafega fora do sistema. */
const LENGTH = 16;

export function generateTemporaryPassword(length: number = LENGTH): string {
  const size = Math.max(length, MIN_PASSWORD_LENGTH);
  const bytes = new Uint32Array(size);

  // `crypto.getRandomValues` e não `Math.random`: senha é credencial, ainda que temporária.
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/** Alfabeto exposto para o teste conferir que nada ambíguo escapou. */
export const TEMPORARY_PASSWORD_ALPHABET = ALPHABET;
