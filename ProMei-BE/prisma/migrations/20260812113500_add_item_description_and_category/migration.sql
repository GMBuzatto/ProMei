-- AlterTable
-- RF-30: item passa a ter descricao e categoria. Ambos opcionais: RN-25 define
-- como obrigatorios apenas nome, unidade e preco.
ALTER TABLE "items" ADD COLUMN     "description" TEXT,
ADD COLUMN     "category" TEXT;

-- CreateIndex
-- RF-31: o filtro por categoria sempre roda dentro do escopo da empresa.
CREATE INDEX "items_company_id_category_idx" ON "items"("company_id", "category");
