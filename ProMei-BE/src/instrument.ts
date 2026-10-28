/**
 * Inicializacao do Sentry — precisa ser o PRIMEIRO import do processo.
 *
 * O `@sentry/node` instrumenta `http`/`fastify` via OpenTelemetry, e so consegue
 * fazer isso sobre modulos que ainda nao foram carregados. Inicializar dentro de
 * um `onModuleInit` do Nest (como era antes) chega tarde demais: o servidor HTTP
 * ja esta de pe, nenhuma transacao e criada, e sem transacao nao existe p95 —
 * logo o alerta de latencia do docs/13 nunca teria dado para observar.
 *
 * Erros continuam sendo enviados pelo `SentryService`, chamado no filtro global.
 */
import 'dotenv/config';
import * as Sentry from '@sentry/node';
import { buildSentryOptions } from './shared/sentry/sentry.options';

const { options, warnings } = buildSentryOptions(process.env);

// Ainda nao ha logger do Nest aqui — este arquivo roda antes de tudo.
for (const warning of warnings) {
  console.warn(`[sentry] ${warning}`);
}

// O "Sentry active" com environment e sample rate e logado pelo SentryService,
// ja com o logger do Nest — aqui so a inicializacao, que precisa vir antes dele.
if (options) {
  Sentry.init(options);
}
