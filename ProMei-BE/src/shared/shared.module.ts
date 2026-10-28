import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './config';
import type { Env } from './config';
import { AllExceptionsFilter } from './filters';
import { AppThrottlerGuard } from './guards/app-throttler.guard';
import { CorrelationIdInterceptor } from './interceptors';
import { LoggerModule } from './logging';
import { PrismaModule } from './prisma';
import { SentryModule } from './sentry';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    PrismaModule,
    SentryModule,
    // Rate limit global por IP (docs/09-seguranca.md). Rotas podem ser mais
    // estritas via @Throttle (ex.: /auth/*). Valores vêm de RATE_LIMIT_MAX /
    // RATE_LIMIT_TTL_MS no .env — nunca hardcoded (docs/16).
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => [
        {
          ttl: config.get('RATE_LIMIT_TTL_MS', { infer: true }),
          limit: config.get('RATE_LIMIT_MAX', { infer: true }),
        },
      ],
    }),
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: CorrelationIdInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
  ],
  exports: [ConfigModule, LoggerModule, PrismaModule, SentryModule],
})
export class SharedModule {}
