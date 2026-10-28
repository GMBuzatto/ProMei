# Comprovante de venda — especificação do PDF

> Decide o item que estava em aberto no épico 10 ([32](32-plano-de-implementacao.md)).
> Implementação em `src/modules/receipts/receipt-pdf.service.ts`.

## O que já existe

O `ReceiptPdfService` do MVP renderiza o comprovante de uma **movimentação de saída**: uma
página A4, cabeçalho da empresa, tabela de itens, total e o aviso da RN-24 ancorado no rodapé.

Duas coisas nele já anteciparam a fase 2, e por isso o trabalho aqui é **aditivo**:

- `lines` já é um array (o comentário no código diz literalmente que "saída de vários itens
  numa venda só é uma questão de tempo");
- o rodapé já é ancorado no pé da página, não no fim do fluxo — então uma venda com muitos
  itens não empurra o aviso obrigatório para fora da vista.

## Decisão: um renderizador, duas variantes

Não são dois PDFs. É o mesmo documento com blocos condicionais, escolhidos pela presença dos
dados da venda:

```text
COMPROVANTE DE SAÍDA          origem = movimentação manual (MVP, inalterado)
COMPROVANTE DE VENDA          origem = venda (fase 2)
```

Motivo: os dois são o mesmo documento para quem recebe — o papel que o cliente leva do
balcão. Duplicar o renderizador significaria corrigir o aviso da RN-24 em dois lugares, e um
deles ficaria para trás.

## Layout

```text
┌──────────────────────────────────────────────────────────────┐
│                    COMPROVANTE DE VENDA                      │  título por variante
│                      Empresa Exemplo Ltda                    │
│                    CNPJ/CPF: 00.000.000/0001-00              │
│                                                              │
│  Venda nº 000123                    Emitido em: 03/09 14:22  │  bloco novo: nº da VENDA
│  Comprovante nº 000456                                       │  nº do comprovante segue existindo
│  Responsável: maria@empresa.com                              │
│                                                              │
│  CLIENTE                                                     │  ← bloco novo, condicional
│  João da Silva · CPF 000.000.000-00                          │
│  (11) 90000-0000                                             │
│ ──────────────────────────────────────────────────────────── │
│  ITEM                    QTD    VALOR UNIT.        TOTAL     │
│  PARAF-001 - Parafuso    2 un      R$ 25,00     R$ 50,00     │
│  ...                                                          │
│ ──────────────────────────────────────────────────────────── │
│                                  Subtotal:      R$ 500,00    │  ← subtotal/desconto novos
│                                  Desconto:       R$ 20,00    │     (só quando > 0)
│                                  TOTAL:         R$ 480,00    │
│                                                              │
│  PAGAMENTO                                                   │  ← bloco novo, condicional
│  À vista · PIX · PAGO                                        │
│    ou                                                        │
│  A prazo · Vencimento: 03/10/2026                            │
│  Valor pendente: R$ 480,00                                   │
│                                                              │
│                   Documento sem valor fiscal                 │  RN-24, ancorado no rodapé
│         Emitido pelo ProMei. Controle interno.            │
└──────────────────────────────────────────────────────────────┘
```

### Blocos condicionais

| Bloco | Aparece quando |
|---|---|
| Título "COMPROVANTE DE VENDA" | há venda; senão "COMPROVANTE DE SAÍDA" |
| `Venda nº` | há venda |
| `CLIENTE` | a venda tem cliente (venda de balcão sem cliente **omite o bloco inteiro**, não imprime "não identificado") |
| Linha do documento/telefone | o cliente tem o dado preenchido |
| `Desconto` | `discount > 0` |
| `PAGAMENTO` | há venda |
| `Vencimento` / `Valor pendente` | venda a prazo |
| `Motivo` | movimentação manual (é o `reason` do MVP; venda não tem) |

Cliente anonimizado (LGPD, [PD-17](31-decisoes-pendentes.md#pd-17)) imprime o rótulo genérico
que ficou gravado no cadastro, sem documento nem telefone — o comprovante é gerado sob
demanda e reflete o cadastro **de agora**, não o do dia da venda. Isso é deliberado: o
comprovante é um documento reimprimível, não um registro histórico. O registro histórico é a
venda.

## Decisões que valem código

**1. O PDF não calcula nada.** Hoje o renderizador faz `unitPrice * quantity` e soma em
`number`. Para movimentação de um item isso nunca deu problema; para venda com desconto e N
itens, é a rota conhecida para o rodapé não bater com a soma das linhas.

A partir da fase 2, `ReceiptPdfData` recebe **strings já formatadas** (originadas de
`Prisma.Decimal`), e o serviço só desenha. Quem calcula é `sale-totals.ts`
([19](19-vendas.md#aritmética-do-dinheiro)), que é a única fonte de verdade da aritmética.

**2. Continua A4, não bobina 80 mm.** Impressora térmica é o formato natural do balcão, mas
o MEI-alvo do MVP imprime em A4 ou manda o PDF pelo WhatsApp — e o comprovante atual já é A4.
Uma segunda variante de página é feature própria, com sua própria decisão; misturar as duas
agora dobraria o trabalho de layout sem pedido do negócio.

**3. Venda cancelada imprime com marca d'água.** O comprovante não é apagado nem tem o número
reaproveitado ([26](26-cancelamentos-e-estornos.md#comprovante)). Ao regerar, o PDF de uma
venda `CANCELED` recebe a palavra **CANCELADA** em diagonal, cinza claro, atrás do conteúdo,
mais a data do cancelamento abaixo do total. Sem isso, um PDF antigo circula como se a venda
valesse.

**4. Paginação.** Com mais itens do que cabem em uma página, o PDFKit quebra sozinho, mas o
rodapé é desenhado uma vez em posição absoluta. A implementação precisa desenhar o rodapé
**por página** (evento `pageAdded`), senão o aviso da RN-24 some das páginas seguintes — que
é exatamente o cenário de uma venda grande. `SALES_MAX_ITEMS_PER_SALE = 100` põe um teto
conhecido no pior caso.

**5. A geração continua assíncrona, com retry, depois do commit.** Nada muda no fluxo do
MVP: número emitido dentro da transação, PDF depois, comprovante `PENDING` até o arquivo
existir, regenerável sob demanda (docs/06).

## Contrato de dados

```ts
export interface ReceiptPdfData {
  number: string;                 // comprovante, já com padding
  issuedAt: Date;
  company: { name: string; document: string };
  issuedBy: string;

  /** Presente só na variante de venda. */
  sale?: {
    number: string;               // já com padding
    kind: 'CASH' | 'CREDIT';
    paymentMethodLabel: string | null;   // "PIX", "Dinheiro"... já em pt-BR
    dueDate: Date | null;
    /** Strings formatadas em BRL — o PDF não converte nem soma. */
    subtotal: string;
    discount: string | null;
    total: string;
    pendingAmount: string | null;
    canceledAt: Date | null;      // preenchido → marca d'água CANCELADA
    customer: { name: string; document: string | null; phone: string | null } | null;
  };

  /** Movimentação manual (MVP). Mutuamente exclusivo com `sale`. */
  reason?: string | null;

  lines: ReceiptLine[];           // `total` da linha vem pronto, como string
}
```

`sale` e `reason` mutuamente exclusivos espelham o `CHECK` que a tabela `receipts` já tem
([27](27-modelo-de-dados.md#receipts)): um comprovante é de uma saída manual **ou** de uma
venda.

## Teste

- venda com 1 item, à vista, sem cliente → sem bloco CLIENTE, PAGAMENTO diz "À vista · PAGO";
- venda a prazo com cliente → bloco CLIENTE, vencimento e valor pendente;
- venda com desconto → subtotal, desconto e total, e **a soma das linhas bate com o
  subtotal** (asserção sobre o texto extraído do PDF);
- venda com 100 itens → mais de uma página, e o aviso da RN-24 em **todas**;
- venda cancelada → marca d'água presente;
- movimentação manual → comprovante idêntico ao do MVP (teste de regressão, comparando com o
  snapshot existente).
