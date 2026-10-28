import { CORRELATION_ID_HEADER } from '../logging';

/**
 * Tipo proprio em vez do `CorsOptions` do Nest: aquele declara
 * `origin: StaticOrigin | CustomOrigin`, e o `CustomOrigin` (callback de 1
 * argumento, herdado do pacote `cors` do Express) nao e aceito pelo
 * `enableCors` do adapter Fastify, cujo callback tem assinatura diferente.
 * Como a allowlist aqui e sempre uma lista estatica, tipar concreto resolve
 * sem `as`.
 */
export interface CorsConfig {
  origin: string[];
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

/**
 * Fonte única da configuração de CORS.
 *
 * Por que ser explícito em vez de confiar nos defaults: `app.enableCors()` no
 * adapter Fastify delega ao `@fastify/cors`, cujo default de `methods` é
 * `GET,HEAD,POST` — e NÃO o conjunto do pacote `cors` do Express
 * (`GET,HEAD,PUT,PATCH,POST,DELETE`). Sem declarar os métodos, todo preflight
 * de `PATCH`/`PUT`/`DELETE` volta 204 com
 * `Access-Control-Allow-Methods: GET,HEAD,POST` e o navegador bloqueia a
 * requisição real ("Method PATCH is not allowed by
 * Access-Control-Allow-Methods in preflight response").
 *
 * `exposedHeaders`: sem isso o navegador entrega a resposta mas esconde o
 * `x-correlation-id` do JS (`response.headers.get()` devolve null cross-origin),
 * quebrando a rastreabilidade prometida em docs/13-observabilidade.md.
 *
 * `credentials: false`: a API é stateless com JWT no header `Authorization`
 * (docs/09-seguranca.md) — não há cookie de sessão para o navegador enviar.
 */
export function createCorsOptions(origins: readonly string[]): CorsConfig {
  if (origins.length === 0) {
    throw new Error(
      'CORS_ORIGINS está vazio: nenhuma origem seria aceita e todo request do front-end ' +
        'falharia com erro de CORS. Configure a allowlist do ambiente (docs/07-configuracao-ambiente.md).',
    );
  }

  return {
    origin: [...origins],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', CORRELATION_ID_HEADER],
    exposedHeaders: [CORRELATION_ID_HEADER],
    credentials: false,
    // Cacheia o preflight por 1h no navegador: sem isso cada PATCH/DELETE gasta
    // dois round-trips (Chrome ignora valores acima de 7200s).
    maxAge: 3600,
  };
}
