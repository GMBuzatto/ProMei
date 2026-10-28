/**
 * Dataset representativo da fase 2 — Cliente + Compras.
 *
 * O QUE É: os cenários que o seed precisa criar para que fechamento,
 * inadimplência e limite possam ser conferidos à mão em staging, e para servir
 * de fixture aos testes de integração (docs/30).
 *
 * POR QUE É SÓ DADO, SEM PRISMA: as tabelas da fase 2 (`customers`, `sales`,
 * `payments`, ...) ainda não existem — elas chegam com os épicos 9 e 10
 * (docs/32). Este arquivo é TypeScript puro, sem import do client gerado, então
 * compila hoje e é consumido sem reescrita quando as migrações entrarem: o seed
 * passa a percorrer `PHASE_TWO_CUSTOMERS` e criar as linhas.
 *
 * COMO AS DATAS FUNCIONAM: nada é data absoluta. Tudo é **offset em dias** a
 * partir de "hoje", resolvido por `resolveDate`. Um dataset com datas fixas
 * envelhece — o cliente que era "vencido há 5 dias" vira "vencido há 200" no mês
 * seguinte, e o cenário que ele existia para cobrir desaparece.
 *
 * Os cenários abaixo cobrem, de propósito, cada linha da lista de casos
 * extremos de docs/30 que depende de dados.
 */

export type CustomerScenario =
  /** Cliente novo, sem compra nenhuma. Resumo financeiro todo zerado. */
  | 'REGULAR_SEM_COMPRAS'
  /** Só compras à vista. Prova que venda à vista NÃO consome limite (RN-51). */
  | 'REGULAR_SO_A_VISTA'
  /** Limite exatamente consumido: 1000 de 1000. A próxima venda a prazo é bloqueada. */
  | 'LIMITE_NO_TETO'
  /** Utilizado acima do limite por liberação administrativa: disponível negativo (docs/20). */
  | 'LIMITE_ESTOURADO_POR_LIBERACAO'
  /** Venda vencida há poucos dias: situação OVERDUE. */
  | 'EM_ATRASO'
  /** Venda vencida há mais de FINANCE_DELINQUENCY_DAYS: situação DELINQUENT. */
  | 'INADIMPLENTE'
  /** Esteve vencido e quitou: voltou a REGULAR, mas o limite usado NÃO voltou (RN-64). */
  | 'REGULARIZADO'
  /** Bloqueio manual do operador, independente de qualquer atraso. */
  | 'BLOQUEADO_MANUALMENTE'
  /** Cliente inativo: histórico permanece, venda nova é recusada (RN-33). */
  | 'INATIVO'
  /** Anonimizado a pedido do titular (LGPD, PD-17): vendas permanecem. */
  | 'ANONIMIZADO';

export type SaleScenario =
  | 'A_VISTA_PAGA'
  /** A prazo, ainda no prazo. */
  | 'A_PRAZO_PENDENTE'
  /** A prazo com recebimento parcial. */
  | 'A_PRAZO_PARCIAL'
  /** A prazo vencida e não paga. */
  | 'A_PRAZO_VENCIDA'
  /** Vencida há mais de 30 dias — é ela que torna o cliente inadimplente. */
  | 'A_PRAZO_INADIMPLENTE'
  /** Quitada DEPOIS do vencimento: o atraso fica nos recebimentos, não no status. */
  | 'A_PRAZO_PAGA_COM_ATRASO'
  /** Cancelada: não entra em nada, nem no limite utilizado (PD-02). */
  | 'CANCELADA'
  /** Liberada administrativamente por DOIS motivos — o caso que o fechamento
   *  precisa contar UMA vez (DISTINCT sale_id, docs/25). */
  | 'LIBERADA_DOIS_MOTIVOS'
  /** Venda do período ANTERIOR, recebida no período corrente: é ela que faz
   *  competência e caixa não fecharem entre si (docs/25). */
  | 'PERIODO_ANTERIOR_PAGA_AGORA';

export interface SeedSaleItem {
  /** Índice do item no catálogo criado pelo seed da empresa (0-based). */
  itemIndex: number;
  quantity: number;
  /** Em reais, como string — nunca number (docs/19). */
  unitPrice: string;
}

export interface SeedPayment {
  /** Dias a partir de hoje. Negativo = passado. */
  paidAtOffsetDays: number;
  amount: string;
  method: 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'PIX' | 'OTHER';
  reversed?: boolean;
}

export interface SeedSale {
  scenario: SaleScenario;
  kind: 'CASH' | 'CREDIT';
  paymentMethod?: 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'PIX' | 'OTHER';
  soldAtOffsetDays: number;
  dueDateOffsetDays?: number;
  items: SeedSaleItem[];
  discount?: string;
  payments?: SeedPayment[];
  canceled?: { offsetDays: number; reason: string };
  /** Motivos liberados administrativamente. Só bloqueios de crédito (PD-01). */
  authorizedBlockReasons?: ('INSUFFICIENT_LIMIT' | 'OVERDUE_PAYMENT' | 'CUSTOMER_DELINQUENT')[];
}

export interface SeedCustomer {
  scenario: CustomerScenario;
  name: string;
  document: string | null;
  creditLimit: string;
  status: 'ACTIVE' | 'INACTIVE';
  blockedForCredit?: boolean;
  anonymized?: boolean;
  sales: SeedSale[];
}

/** Resolve um offset em dias para Date, a partir de uma referência injetada. */
export function resolveDate(reference: Date, offsetDays: number): Date {
  const date = new Date(reference);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

/**
 * Vendas de balcão, sem cliente. Existem para provar duas coisas no fechamento:
 * entram no total vendido, e aparecem na linha consolidada do relatório por
 * cliente em vez de sumirem (RN-105).
 */
export const PHASE_TWO_ANONYMOUS_SALES: SeedSale[] = [
  {
    scenario: 'A_VISTA_PAGA',
    kind: 'CASH',
    paymentMethod: 'CASH',
    soldAtOffsetDays: -2,
    items: [{ itemIndex: 0, quantity: 1, unitPrice: '30.00' }],
    payments: [{ paidAtOffsetDays: -2, amount: '30.00', method: 'CASH' }],
  },
  {
    scenario: 'A_VISTA_PAGA',
    kind: 'CASH',
    paymentMethod: 'PIX',
    soldAtOffsetDays: -1,
    items: [
      { itemIndex: 1, quantity: 2, unitPrice: '45.50' },
      { itemIndex: 2, quantity: 1, unitPrice: '19.00' },
    ],
    discount: '10.00',
    payments: [{ paidAtOffsetDays: -1, amount: '100.00', method: 'PIX' }],
  },
];

export const PHASE_TWO_CUSTOMERS: SeedCustomer[] = [
  {
    scenario: 'REGULAR_SEM_COMPRAS',
    name: 'Ana Ribeiro',
    document: '11111111111',
    creditLimit: '500.00',
    status: 'ACTIVE',
    sales: [],
  },
  {
    scenario: 'REGULAR_SO_A_VISTA',
    name: 'Bruno Carvalho',
    // Sem documento de propósito: exercita o índice único PARCIAL (RN-31).
    document: null,
    creditLimit: '1000.00',
    status: 'ACTIVE',
    sales: [
      {
        scenario: 'A_VISTA_PAGA',
        kind: 'CASH',
        paymentMethod: 'DEBIT_CARD',
        soldAtOffsetDays: -6,
        items: [{ itemIndex: 0, quantity: 4, unitPrice: '80.00' }],
        payments: [{ paidAtOffsetDays: -6, amount: '320.00', method: 'DEBIT_CARD' }],
      },
    ],
  },
  {
    // Limite EXATAMENTE consumido: 400 + 600 = 1000 de 1000.
    // Disponível zero, próxima venda a prazo bloqueada por 1 centavo que seja.
    scenario: 'LIMITE_NO_TETO',
    name: 'Carla Nogueira',
    document: '22222222222',
    creditLimit: '1000.00',
    status: 'ACTIVE',
    sales: [
      {
        scenario: 'A_PRAZO_PENDENTE',
        kind: 'CREDIT',
        soldAtOffsetDays: -10,
        dueDateOffsetDays: 20,
        items: [{ itemIndex: 1, quantity: 4, unitPrice: '100.00' }],
      },
      {
        scenario: 'A_PRAZO_PARCIAL',
        kind: 'CREDIT',
        soldAtOffsetDays: -8,
        dueDateOffsetDays: 22,
        items: [{ itemIndex: 2, quantity: 6, unitPrice: '100.00' }],
        // Pagou metade: o limite utilizado NÃO devolve (RN-51). É o cenário que
        // mais gera dúvida no balcão, então precisa estar visível em staging.
        payments: [{ paidAtOffsetDays: -3, amount: '300.00', method: 'PIX' }],
      },
    ],
  },
  {
    // Utilizado 1300 sobre limite 1000: disponível −300 (docs/20).
    scenario: 'LIMITE_ESTOURADO_POR_LIBERACAO',
    name: 'Diego Matos',
    document: '33333333333',
    creditLimit: '1000.00',
    status: 'ACTIVE',
    sales: [
      {
        scenario: 'A_PRAZO_PENDENTE',
        kind: 'CREDIT',
        soldAtOffsetDays: -12,
        dueDateOffsetDays: 18,
        items: [{ itemIndex: 0, quantity: 10, unitPrice: '100.00' }],
      },
      {
        scenario: 'LIBERADA_DOIS_MOTIVOS',
        kind: 'CREDIT',
        soldAtOffsetDays: -4,
        dueDateOffsetDays: 26,
        items: [{ itemIndex: 3, quantity: 3, unitPrice: '100.00' }],
        // Duas linhas em sale_authorizations, UMA venda. O total liberado do
        // fechamento precisa contar 300, não 600 (docs/25).
        authorizedBlockReasons: ['INSUFFICIENT_LIMIT', 'OVERDUE_PAYMENT'],
      },
    ],
  },
  {
    scenario: 'EM_ATRASO',
    name: 'Elaine Souza',
    document: '44444444444',
    creditLimit: '800.00',
    status: 'ACTIVE',
    sales: [
      {
        scenario: 'A_PRAZO_VENCIDA',
        kind: 'CREDIT',
        soldAtOffsetDays: -35,
        // Vencida há 5 dias: OVERDUE, ainda não inadimplente.
        dueDateOffsetDays: -5,
        items: [{ itemIndex: 1, quantity: 2, unitPrice: '150.00' }],
      },
      {
        // Em dia. Prova que uma venda vencida basta para bloquear, mesmo com
        // outras em ordem (RN-62).
        scenario: 'A_PRAZO_PENDENTE',
        kind: 'CREDIT',
        soldAtOffsetDays: -5,
        dueDateOffsetDays: 25,
        items: [{ itemIndex: 2, quantity: 1, unitPrice: '120.00' }],
      },
    ],
  },
  {
    scenario: 'INADIMPLENTE',
    name: 'Fábio Lima',
    document: '55555555555',
    creditLimit: '1500.00',
    status: 'ACTIVE',
    sales: [
      {
        scenario: 'A_PRAZO_INADIMPLENTE',
        kind: 'CREDIT',
        soldAtOffsetDays: -75,
        // Vencida há 45 dias: passou de FINANCE_DELINQUENCY_DAYS (30).
        dueDateOffsetDays: -45,
        items: [{ itemIndex: 0, quantity: 5, unitPrice: '90.00' }],
        payments: [{ paidAtOffsetDays: -60, amount: '50.00', method: 'CASH' }],
      },
    ],
  },
  {
    scenario: 'REGULARIZADO',
    name: 'Gabriela Pinto',
    document: '66666666666',
    creditLimit: '1000.00',
    status: 'ACTIVE',
    sales: [
      {
        // Venceu há 20 dias e foi quitada há 2: cliente voltou a REGULAR, e o
        // limite utilizado do período continua consumido (RN-64).
        scenario: 'A_PRAZO_PAGA_COM_ATRASO',
        kind: 'CREDIT',
        soldAtOffsetDays: -50,
        dueDateOffsetDays: -20,
        items: [{ itemIndex: 3, quantity: 2, unitPrice: '200.00' }],
        payments: [{ paidAtOffsetDays: -2, amount: '400.00', method: 'PIX' }],
      },
      {
        // Venda do período anterior recebida no período corrente: é o caso que
        // faz competência e caixa não baterem no painel (docs/25).
        scenario: 'PERIODO_ANTERIOR_PAGA_AGORA',
        kind: 'CREDIT',
        soldAtOffsetDays: -40,
        dueDateOffsetDays: -10,
        items: [{ itemIndex: 1, quantity: 1, unitPrice: '250.00' }],
        payments: [{ paidAtOffsetDays: -1, amount: '250.00', method: 'CASH' }],
      },
    ],
  },
  {
    scenario: 'BLOQUEADO_MANUALMENTE',
    name: 'Henrique Alves',
    document: '77777777777',
    creditLimit: '2000.00',
    status: 'ACTIVE',
    // Sem atraso nenhum: o bloqueio é decisão do operador, não derivado.
    blockedForCredit: true,
    sales: [
      {
        scenario: 'A_VISTA_PAGA',
        kind: 'CASH',
        paymentMethod: 'PIX',
        soldAtOffsetDays: -3,
        items: [{ itemIndex: 2, quantity: 1, unitPrice: '75.00' }],
        payments: [{ paidAtOffsetDays: -3, amount: '75.00', method: 'PIX' }],
      },
    ],
  },
  {
    scenario: 'INATIVO',
    name: 'Isabel Moraes',
    document: '88888888888',
    creditLimit: '600.00',
    status: 'INACTIVE',
    sales: [
      {
        scenario: 'CANCELADA',
        kind: 'CREDIT',
        soldAtOffsetDays: -15,
        dueDateOffsetDays: 15,
        items: [{ itemIndex: 0, quantity: 3, unitPrice: '60.00' }],
        canceled: { offsetDays: -14, reason: 'Cliente desistiu da compra' },
      },
    ],
  },
  {
    scenario: 'ANONIMIZADO',
    name: 'Cliente removido',
    document: null,
    creditLimit: '0.00',
    status: 'INACTIVE',
    anonymized: true,
    sales: [
      {
        // A venda permanece: é o ponto da decisão do PD-17.
        scenario: 'A_VISTA_PAGA',
        kind: 'CASH',
        paymentMethod: 'CASH',
        soldAtOffsetDays: -20,
        items: [{ itemIndex: 4, quantity: 2, unitPrice: '40.00' }],
        payments: [{ paidAtOffsetDays: -20, amount: '80.00', method: 'CASH' }],
      },
    ],
  },
];

/**
 * Conferência rápida do que o dataset produz, para bater com o painel de
 * fechamento na primeira vez que ele rodar. Os números consideram apenas as
 * vendas com `soldAtOffsetDays` dentro do período corrente da empresa — ou
 * seja, dependem do `closing_day` configurado.
 */
export const PHASE_TWO_EXPECTATIONS = {
  clientes: PHASE_TWO_CUSTOMERS.length,
  vendasComCliente: PHASE_TWO_CUSTOMERS.reduce((sum, c) => sum + c.sales.length, 0),
  vendasSemCliente: PHASE_TWO_ANONYMOUS_SALES.length,
  vendasCanceladas: 1,
  vendasLiberadas: 1,
  linhasDeAutorizacao: 2,
  clientesEmAtraso: 1,
  clientesInadimplentes: 1,
} as const;
