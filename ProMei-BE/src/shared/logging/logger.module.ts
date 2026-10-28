import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { Env } from '../config';
import { getCorrelationId, type RequestWithContext } from './correlation-id';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => {
        const isDevelopment = configService.get<string>('NODE_ENV') === 'development';

        return {
          pinoHttp: {
            level: configService.get<string>('LOG_LEVEL') ?? 'info',

            // Campos padrao do docs/13-observabilidade.md (snake_case).
            // company_id e user_id so aparecem quando houver usuario autenticado.
            customProps: (req) => {
              const request = req as unknown as RequestWithContext;
              const companyId = request.user?.company_id;
              const userId = request.user?.sub;

              return {
                correlation_id: getCorrelationId(request),
                ...(companyId ? { company_id: companyId } : {}),
                ...(userId ? { user_id: userId } : {}),
              };
            },

            // Mantem rota, status e duracao sem carregar headers inteiros no log.
            serializers: {
              req: (req: { method?: string; url?: string }) => ({
                method: req.method,
                url: req.url,
              }),
              res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
            },

            // Nunca errorSpy credencial ou dado pessoal sensivel (docs/13 e docs/09).
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.senha',
                'req.body.token',
                'req.body.refreshToken',
                'req.body.password_hash',
                // Senha administrativa da empresa (docs/20, PD-13) e a senha
                // de login usada para confirmar a troca (docs/24).
                'req.body.currentPassword',
                'req.body.newAdminPassword',
                'req.body.adminPasswordHash',
                'res.headers["set-cookie"]',
              ],
              remove: true,
            },

            transport: isDevelopment
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
                }
              : undefined,
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
