-- Gives every account its own complete document-number sequence set.
-- Existing accounts are backfilled, and future signups receive the same defaults automatically.
DO $$
DECLARE
  admin_record record;
  sequence_default record;
  candidate_prefix text;
  suffix_number integer;
BEGIN
  FOR admin_record IN SELECT id FROM admin_users ORDER BY created_at, id LOOP
    FOR sequence_default IN
      SELECT *
      FROM (VALUES
        ('SALE', 'SALE'),
        ('PURCHASE', 'PUR'),
        ('CUSTOMER_RECEIPT', 'CR'),
        ('SUPPLIER_PAYMENT', 'SP'),
        ('SALES_RETURN', 'SR'),
        ('PURCHASE_RETURN', 'PR'),
        ('EXPENSE', 'EXP'),
        ('EMPLOYEE_ADVANCE', 'EADV'),
        ('PAYROLL', 'PAY'),
        ('SALARY_PAYMENT', 'SALP'),
        ('ADVANCE_RECOVERY', 'EAR')
      ) AS defaults(document_type, prefix)
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM document_sequences AS existing
        WHERE existing.admin_user_id = admin_record.id
          AND existing.document_type = sequence_default.document_type::document_type
      ) THEN
        candidate_prefix := sequence_default.prefix;
        suffix_number := 1;

        WHILE EXISTS (
          SELECT 1
          FROM document_sequences AS existing
          WHERE existing.admin_user_id = admin_record.id
            AND existing.prefix = candidate_prefix
        ) LOOP
          suffix_number := suffix_number + 1;
          candidate_prefix :=
            left(sequence_default.prefix, 20 - length(suffix_number::text) - 1)
            || '-'
            || suffix_number::text;
        END LOOP;

        INSERT INTO document_sequences (
          admin_user_id,
          document_type,
          prefix,
          next_number
        )
        VALUES (
          admin_record.id,
          sequence_default.document_type::document_type,
          candidate_prefix,
          1
        );
      END IF;
    END LOOP;
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION provision_admin_document_sequences() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO document_sequences (admin_user_id, document_type, prefix, next_number)
  VALUES
    (NEW.id, 'SALE', 'SALE', 1),
    (NEW.id, 'PURCHASE', 'PUR', 1),
    (NEW.id, 'CUSTOMER_RECEIPT', 'CR', 1),
    (NEW.id, 'SUPPLIER_PAYMENT', 'SP', 1),
    (NEW.id, 'SALES_RETURN', 'SR', 1),
    (NEW.id, 'PURCHASE_RETURN', 'PR', 1),
    (NEW.id, 'EXPENSE', 'EXP', 1),
    (NEW.id, 'EMPLOYEE_ADVANCE', 'EADV', 1),
    (NEW.id, 'PAYROLL', 'PAY', 1),
    (NEW.id, 'SALARY_PAYMENT', 'SALP', 1),
    (NEW.id, 'ADVANCE_RECOVERY', 'EAR', 1);

  RETURN NEW;
END;
$$;

CREATE TRIGGER admin_users_provision_document_sequences
AFTER INSERT ON admin_users
FOR EACH ROW EXECUTE FUNCTION provision_admin_document_sequences();
