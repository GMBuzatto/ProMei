import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Public } from '../../shared/decorators';
import type { FastifyReply } from 'fastify';
import { HealthService, type LivenessStatus, type ReadinessStatus } from './health.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness: 200 enquanto o processo responder. */
  @Get()
  check(): LivenessStatus {
    return this.healthService.check();
  }

  /** Readiness: 200 quando pronto, 503 quando degradado. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<ReadinessStatus> {
    const result = await this.healthService.checkReadiness();

    if (result.status !== 'ok') {
      void reply.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }
}
