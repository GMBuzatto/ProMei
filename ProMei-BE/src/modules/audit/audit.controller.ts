import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermission } from '../../shared/decorators';
import { AuditService } from './audit.service';
import type { PaginatedAuditLogs } from './dto/audit-log-response.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

/**
 * Consulta da trilha de auditoria (RNF-06, docs/09).
 *
 * Rota de tenant: o Admin investiga o que aconteceu na própria empresa, e o
 * escopo automático garante que ele não veja registros de outra.
 *
 * Só leitura, de propósito: não existe endpoint para criar, alterar ou apagar
 * registro de auditoria. Escrever na trilha é responsabilidade dos services que
 * executam a ação auditada.
 */
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission('audit-logs:read')
  async list(@Query() query: ListAuditLogsQueryDto): Promise<PaginatedAuditLogs> {
    return this.auditService.list(query);
  }
}
