import type { JwtPayload } from "@/types/user";

/**
 * Decodifica um JWT sem validar a assinatura (o servidor já validou).
 * Retorna o payload ou null se inválido.
 *
 * **Nunca confiar nesse valor para segurança** — é só conveniência para ler
 * claims. A API valida de verdade no servidor (docs/09-seguranca.md).
 */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = JSON.parse(atob(payload));
    return decoded as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Extrai as roles do token decodificado.
 */
export function extractRolesFromToken(token: string): string[] {
  const payload = decodeJwt(token);
  return payload?.roles ?? [];
}
