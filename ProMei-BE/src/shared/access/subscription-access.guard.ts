import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { BusinessErrorCode, BusinessException } from '../errors';
import type { AuthenticatedUser } from '../logging';
import { PrismaService } from '../prisma/prisma.service';
import { type AccessDecision, decideAccess, isWriteMethod } from './access-policy';
import { CompanyStatus } from '../../generated/prisma/client';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  decision: AccessDecision;
  expiresAt: number;
}

/**
 * Aplica a tabela de decisão de acesso (docs/04) em cada requisição.
 *
 * Consulta o estado da empresa e da assinatura no banco, com cache de 60s:
 * marcar uma empresa como inadimplente precisa ter efeito quase imediato, sem
 * esperar o access token expirar.
 *
 * Usuário de plataforma (Super Admin/Staff) não passa por aqui — ele não
 * pertence a empresa nenhuma (RN-05) e é justamente quem administra os estados.
 */
@Injectable()
export class SubscriptionAccessGuard implements CanActivate {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser; method: string }>();
    const companyId = request.user?.company_id;

    // Sem empresa = usuário de plataforma; a tabela não se aplica.
    if (!companyId) return true;

    const decision = await this.getDecision(companyId);

    if (!decision.canRead) {
      throw new BusinessException(
        BusinessErrorCode.EMPRESA_SEM_ACESSO,
        this.message(decision),
        HttpStatus.FORBIDDEN,
      );
    }

    if (isWriteMethod(request.method) && !decision.canWrite) {
      throw new BusinessException(
        BusinessErrorCode.ACESSO_SOMENTE_LEITURA,
        this.message(decision),
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }

  /** Limpa o cache — usar ao alterar estado de empresa ou assinatura. */
  invalidate(companyId?: string): void {
    if (companyId) {
      this.cache.delete(companyId);
      return;
    }
    this.cache.clear();
  }

  private async getDecision(companyId: string): Promise<AccessDecision> {
    const cached = this.cache.get(companyId);
    if (cached && cached.expiresAt > Date.now()) return cached.decision;

    // Client cru de propósito: a decisão de acesso precisa enxergar a empresa
    // antes de qualquer escopo de tenant ser aplicado.
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { status: true, subscription: { select: { status: true } } },
    });

    // Empresa inexistente: trata como cancelada. Um token válido apontando para
    // empresa que sumiu não deve virar acesso liberado.
    const decision = company
      ? decideAccess(company.status, company.subscription?.status)
      : decideAccess(CompanyStatus.CANCELED, null);

    this.cache.set(companyId, { decision, expiresAt: Date.now() + CACHE_TTL_MS });
    return decision;
  }

  private message(decision: AccessDecision): string {
    switch (decision.reason) {
      case 'COMPANY_SUSPENDED':
        return 'Empresa suspensa: acesso bloqueado';
      case 'COMPANY_CANCELED':
        return 'Empresa cancelada: acesso bloqueado';
      case 'SUBSCRIPTION_PAST_DUE':
        return 'Assinatura inadimplente: acesso somente leitura';
      default:
        return 'Acesso negado';
    }
  }
}
