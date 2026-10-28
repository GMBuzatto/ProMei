-- receipts.sale_id: índice único deve ser PARCIAL (docs/23, docs/27, docs/33),
-- mesmo padrão de customers_company_document_uniq e
-- stock_movements_sale_item_origin_uniq. A migração 20260908150000 criou a
-- versão gerada pelo Prisma (`@unique` não modela WHERE); esta corrige para
-- a intenção documentada, sem tocar na migração já aplicada.
--
-- Funcionalmente idêntico (Postgres já não colide NULL num índice único
-- comum), mas o WHERE deixa explícito que a unicidade só vale quando o
-- comprovante É de uma venda, em vez de depender desse comportamento.
DROP INDEX "receipts_sale_id_key";

CREATE UNIQUE INDEX "receipts_sale_id_key"
    ON "receipts" ("sale_id")
 WHERE "sale_id" IS NOT NULL;
