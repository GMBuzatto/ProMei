-- CreateEnum
CREATE TYPE "company_segment" AS ENUM ('FOOD', 'HEALTH', 'RETAIL', 'SERVICES', 'OTHER');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "segment" "company_segment" NOT NULL DEFAULT 'OTHER';
