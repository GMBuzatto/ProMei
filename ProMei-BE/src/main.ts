// Precisa ser o primeiro import: o Sentry so instrumenta http/fastify se for
// inicializado antes desses modulos serem carregados (ver src/instrument.ts).
import './instrument';
import helmet from '@fastify/helmet';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './shared/config';
import { validateEnvCompliance } from './shared/config/env-compliance';
import { createCorsOptions, createFastifyAdapter } from './shared/http';

async function bootstrap(): Promise<void> {
  validateEnvCompliance();

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(), {
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService<Env, true>);
  const port = config.getOrThrow<number>('PORT');
  const apiPrefix = config.getOrThrow<string>('API_PREFIX');
  const corsOrigins = config.getOrThrow<string[]>('CORS_ORIGINS');

  await app.register(helmet, { contentSecurityPolicy: false });

  app.enableCors(createCorsOptions(corsOrigins));

  // Versionamento é feito pelo prefixo (/api/v1) — ver docs/08-padroes-de-desenvolvimento.md
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // O flush dos eventos pendentes do Sentry acontece no shutdown, via
  // SentryService (BeforeApplicationShutdown) — por isso os hooks importam aqui.
  app.enableShutdownHooks();

  await app.listen({ port, host: '0.0.0.0' });

  Logger.log(`🚀 ProMei API rodando em http://localhost:${port}${apiPrefix}`, 'Bootstrap');
}

void bootstrap();
