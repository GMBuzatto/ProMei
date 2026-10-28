import { CompanyStatus, SubscriptionStatus } from '../../generated/prisma/client';

/**
 * Tabela de decisão de acesso ao painel (docs/04-regras-de-negocio.md).
 *
 * | Empresa   | Assinatura   | Login | Escrita | Leitura |
 * |-----------|--------------|-------|---------|---------|
 * | ativa     | trial/ativa  | ✅    | ✅      | ✅      |
 * | ativa     | inadimplente | ✅    | ❌      | ✅      |
 * | suspensa  | qualquer     | ❌    | ❌      | ❌      |
 * | cancelada | qualquer     | ❌    | ❌      | ❌      |
 *
 * Função pura de propósito: a regra que decide quem entra no produto precisa ser
 * legível e testável sem banco, sem HTTP e sem mocks.
 */
export interface AccessDecision {
  canLogin: boolean;
  canRead: boolean;
  canWrite: boolean;
  /** Preenchido apenas quando algo é negado, para a mensagem de erro. */
  reason?: 'COMPANY_SUSPENDED' | 'COMPANY_CANCELED' | 'SUBSCRIPTION_PAST_DUE';
}

const FULL_ACCESS: AccessDecision = { canLogin: true, canRead: true, canWrite: true };

export function decideAccess(
  companyStatus: CompanyStatus,
  subscriptionStatus: SubscriptionStatus | null | undefined,
): AccessDecision {
  if (companyStatus === CompanyStatus.SUSPENDED) {
    return { canLogin: false, canRead: false, canWrite: false, reason: 'COMPANY_SUSPENDED' };
  }

  if (companyStatus === CompanyStatus.CANCELED) {
    return { canLogin: false, canRead: false, canWrite: false, reason: 'COMPANY_CANCELED' };
  }

  // Empresa ativa daqui para baixo.
  if (subscriptionStatus === SubscriptionStatus.PAST_DUE) {
    return { canLogin: true, canRead: true, canWrite: false, reason: 'SUBSCRIPTION_PAST_DUE' };
  }

  if (subscriptionStatus === SubscriptionStatus.CANCELED) {
    // Assinatura cancelada com empresa ainda ativa: modo leitura, como
    // inadimplência. A tabela não cobre esse cruzamento explicitamente, e negar
    // escrita é o lado conservador — o dado continua acessível para exportação.
    return { canLogin: true, canRead: true, canWrite: false, reason: 'SUBSCRIPTION_PAST_DUE' };
  }

  if (!subscriptionStatus) {
    // Empresa sem assinatura tem acesso normal.
    //
    // A tabela do docs/04 só restringe por INADIMPLÊNCIA, não por ausência de
    // vínculo. Ausência é estado transitório de provisionamento — existe entre
    // criar a empresa (RN-10) e vincular o plano. Bloquear escrita aqui deixaria
    // toda empresa recém-criada inutilizável até alguém lembrar da assinatura.
    //
    // Quando o negócio quiser cortar acesso, o caminho é suspender a empresa ou
    // marcar a assinatura como inadimplente — os dois estão na tabela.
    return FULL_ACCESS;
  }

  return FULL_ACCESS;
}

/** Métodos HTTP considerados escrita para efeito da tabela de decisão. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isWriteMethod(method: string): boolean {
  return WRITE_METHODS.has(method.toUpperCase());
}
