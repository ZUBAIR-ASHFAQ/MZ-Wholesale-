-- Complete Employee Module 16 shared document-number and cash/bank infrastructure.
-- Rebuild document_type instead of ALTER TYPE ... ADD VALUE so the new enum
-- values can be inserted into document_sequences in this same migration transaction.
ALTER TYPE "document_type" RENAME TO "document_type_before_employee";

CREATE TYPE "document_type" AS ENUM (
  'SALE',
  'PURCHASE',
  'CUSTOMER_RECEIPT',
  'SUPPLIER_PAYMENT',
  'SALES_RETURN',
  'PURCHASE_RETURN',
  'EXPENSE',
  'EMPLOYEE_ADVANCE',
  'PAYROLL',
  'SALARY_PAYMENT',
  'ADVANCE_RECOVERY'
);

ALTER TABLE "document_sequences"
  ALTER COLUMN "document_type" TYPE "document_type"
  USING ("document_type"::text::"document_type");

DROP TYPE "document_type_before_employee";

INSERT INTO "document_sequences" ("document_type", "prefix", "next_number")
VALUES
  ('EMPLOYEE_ADVANCE', 'EADV', 1),
  ('PAYROLL', 'PAY', 1),
  ('SALARY_PAYMENT', 'SALP', 1),
  ('ADVANCE_RECOVERY', 'EAR', 1)
ON CONFLICT ("document_type") DO NOTHING;

ALTER TYPE "movement_source_type" ADD VALUE IF NOT EXISTS 'EMPLOYEE_ADVANCE';
ALTER TYPE "movement_source_type" ADD VALUE IF NOT EXISTS 'ADVANCE_RECOVERY';
ALTER TYPE "movement_source_type" ADD VALUE IF NOT EXISTS 'SALARY_PAYMENT';
ALTER TYPE "movement_source_type" ADD VALUE IF NOT EXISTS 'SALARY_PAYMENT_REVERSAL';
