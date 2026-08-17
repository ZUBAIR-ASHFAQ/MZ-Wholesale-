-- Module 15 Pass 17: failed login events may not map to an existing admin account.
alter table "audit_logs"
  alter column "admin_user_id" drop not null;
