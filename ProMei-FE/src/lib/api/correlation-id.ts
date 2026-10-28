/**
 * Header de correlação, idêntico ao usado pela API
 * (`ProMei-BE/src/shared/logging/correlation-id.ts`).
 *
 * Quem manda o header é o cliente: assim o mesmo id aparece no console do navegador,
 * no log estruturado da API e no Sentry, e um erro reportado pelo usuário vira uma
 * busca só (docs/13-observabilidade.md). Quando o cliente não manda, a API gera o dela
 * e devolve no mesmo header — por isso a resposta sempre vence sobre o id local.
 */
export const CORRELATION_ID_HEADER = "x-correlation-id";

/**
 * `crypto.randomUUID` existe em todo navegador com suporte a Next 15 e no Node 22 (SSR),
 * mas só em contexto seguro (https/localhost). O fallback cobre o caso de preview
 * servido em http puro, onde `randomUUID` fica indisponível.
 */
export function generateCorrelationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const random = Math.random().toString(16).slice(2, 10);
  const time = Date.now().toString(16);
  return `fe-${time}-${random}`;
}
