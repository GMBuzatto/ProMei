-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lockout_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;
