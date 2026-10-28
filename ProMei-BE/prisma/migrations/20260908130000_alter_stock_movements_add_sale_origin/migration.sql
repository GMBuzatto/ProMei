-- Origem da movimentação de estoque + idempotência no banco (docs/23,
-- docs/27#stock_movements, RN-21). Migração `alter_stock_movements_add_sale_origin`
-- (docs/27#ordem-das-migrações, passo 8).
--
-- Aditiva: `origin` chega com default MANUAL, `sale_id`/`sale_item_id`
-- nullable. Nenhuma linha existente é tocada além de receber
-- `origin = 'MANUAL'`.

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "origin" "stock_movement_origin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sale_id" UUID,
ADD COLUMN     "sale_item_id" UUID;

-- CreateIndex
CREATE INDEX "stock_movements_sale_id_idx" ON "stock_movements"("sale_id");

-- CreateIndex
--
-- A idempotência que REALMENTE garante (docs/23): um item de venda tem no
-- máximo uma baixa (SALE) e uma devolução (SALE_CANCELLATION). É a única
-- camada que sobrevive a retry de cliente, replay de requisição, bug de
-- service e deploy concorrente — transação e estado da venda dependem de
-- código correto, este índice não.
--
-- PARCIAL de propósito (docs/27): Prisma não modela índice único parcial,
-- e a versão gerada a partir do schema seria um índice único comum. No
-- Postgres NULL já não colide num índice único comum, mas o WHERE deixa a
-- intenção explícita em vez de depender desse comportamento — mesmo
-- raciocínio de `customers_company_document_uniq` (20260904141347).
CREATE UNIQUE INDEX "stock_movements_sale_item_origin_uniq"
    ON "stock_movements" ("sale_item_id", "origin")
 WHERE "sale_item_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK (docs/23, docs/27) — Prisma não modela CHECK, então entra à mão.
-- MANUAL ⇒ sale_id/sale_item_id nulos; SALE/SALE_CANCELLATION ⇒ ambos
-- preenchidos. É o que impede uma movimentação de venda sem rastro da
-- venda, e uma movimentação manual carregando um sale_id órfão de sentido.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_origin_refs" CHECK (
  ("origin" = 'MANUAL' AND "sale_id" IS NULL AND "sale_item_id" IS NULL) OR
  ("origin" IN ('SALE', 'SALE_CANCELLATION') AND "sale_id" IS NOT NULL AND "sale_item_id" IS NOT NULL)
);

-- CHECK (docs/27, PD-01) — a invariante que a decisão do PD-01 tornou
-- possível: a RN-21 deixou de ter exceção prevista, então vira invariante
-- de banco em vez de regra que depende de todo caminho de código estar
-- correto. Sem NOT VALID: o ADD CONSTRAINT varre as linhas existentes e
-- falha alto se houver saldo negativo herdado — é o comportamento certo,
-- não um detalhe a contornar.
ALTER TABLE "items" ADD CONSTRAINT "items_stock_not_negative" CHECK ("stock" >= 0);
