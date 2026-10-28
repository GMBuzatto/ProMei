-- CreateEnum
CREATE TYPE "customer_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "customer_financial_status" AS ENUM ('REGULAR', 'OVERDUE', 'DELINQUENT');

-- CreateEnum
CREATE TYPE "sale_kind" AS ENUM ('CASH', 'CREDIT');

-- CreateEnum
CREATE TYPE "sale_status" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'OTHER');

-- CreateEnum
CREATE TYPE "sale_block_reason" AS ENUM ('INSUFFICIENT_LIMIT', 'OVERDUE_PAYMENT', 'CUSTOMER_DELINQUENT', 'INSUFFICIENT_STOCK', 'CUSTOMER_INACTIVE', 'CUSTOMER_BLOCKED', 'ITEM_INACTIVE', 'INVALID_DUE_DATE');

-- CreateEnum
CREATE TYPE "sale_authorization_type" AS ENUM ('CREDIT');

-- CreateEnum
CREATE TYPE "stock_movement_origin" AS ENUM ('MANUAL', 'SALE', 'SALE_CANCELLATION');

-- CreateEnum
CREATE TYPE "customer_status_reason" AS ENUM ('SALE', 'PAYMENT', 'PAYMENT_REVERSAL', 'SALE_CANCELED', 'OVERDUE_JOB', 'MANUAL');
