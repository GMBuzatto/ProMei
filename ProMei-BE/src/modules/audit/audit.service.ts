import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { resolvePagination } from '../../shared/pagination';
import type { Env } from '../../shared/config';
import type { Prisma } from '../../generated/prisma/client';
import type { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import type { PaginatedAuditLogs } from './dto/audit-log-response.dto';

export interface AuditLogEntry {
  action: string;
  resource: string;
  userId?: string | null;
  companyId?: string | null;
  diff?: Prisma.InputJsonValue;
  ip?: string | null;
}

/**
 * Trilha de auditoria (docs/09-seguranca.md, RNF-06). Append-only: nunca atualiza
 * nem apaga registros existentes.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async log(entry: AuditLogEntry): Promise<void> {
    await this.prisma.db.auditLog.create({
      data: {
        action: entry.action,
        resource: entry.resource,
        userId: entry.userId ?? null,
        companyId: entry.companyId ?? null,
        diff: entry.diff,
        ip: entry.ip ?? null,
      },
    });
  }

  /**
   * Consulta da trilha (docs/09: "quem fez o quê, quando, em qual empresa").
   *
   * Usa `prisma.db`, então o escopo de tenant se aplica: o Admin de uma empresa
   * vê apenas os registros dela. Ordenado do mais recente para o mais antigo,
   * que é como se investiga um incidente.
   */
  async list(query: ListAuditLogsQueryDto): Promise<PaginatedAuditLogs> {
    const { page, limit, skip } = resolvePagination(this.config, query.page, query.limit);

    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.resource ? { resource: query.resource } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.db.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.auditLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}
