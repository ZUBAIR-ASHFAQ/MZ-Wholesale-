CREATE TYPE "import_job_status" AS ENUM ('VALIDATED', 'IMPORTED', 'FAILED');

CREATE TABLE "import_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" varchar(40) NOT NULL,
  "status" "import_job_status" NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "total_rows" integer DEFAULT 0 NOT NULL,
  "valid_rows" integer DEFAULT 0 NOT NULL,
  "error_rows" integer DEFAULT 0 NOT NULL,
  "imported_rows" integer DEFAULT 0 NOT NULL,
  "error_summary" varchar(500),
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "import_jobs_type_not_blank_check" CHECK (length(trim("type")) > 0),
  CONSTRAINT "import_jobs_file_name_not_blank_check" CHECK (length(trim("file_name")) > 0),
  CONSTRAINT "import_jobs_row_totals_non_negative_check" CHECK (
    "total_rows" >= 0 AND "valid_rows" >= 0 AND "error_rows" >= 0 AND "imported_rows" >= 0
  ),
  CONSTRAINT "import_jobs_row_counts_valid_check" CHECK (
    "valid_rows" + "error_rows" <= "total_rows" AND "imported_rows" <= "valid_rows"
  )
);

CREATE INDEX "import_jobs_type_status_index"
  ON "import_jobs" ("type", "status");
CREATE INDEX "import_jobs_started_at_index"
  ON "import_jobs" ("started_at");

CREATE TABLE "import_job_errors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "import_job_id" uuid NOT NULL,
  "row_number" integer NOT NULL,
  "column_name" varchar(120) NOT NULL,
  "error_code" varchar(80) NOT NULL,
  "message" varchar(500) NOT NULL,
  "raw_row" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "import_job_errors_import_job_id_import_jobs_id_fk"
    FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE cascade,
  CONSTRAINT "import_job_errors_row_number_positive_check" CHECK ("row_number" > 0),
  CONSTRAINT "import_job_errors_column_name_not_blank_check" CHECK (length(trim("column_name")) > 0),
  CONSTRAINT "import_job_errors_error_code_not_blank_check" CHECK (length(trim("error_code")) > 0),
  CONSTRAINT "import_job_errors_message_not_blank_check" CHECK (length(trim("message")) > 0)
);

CREATE INDEX "import_job_errors_job_row_index"
  ON "import_job_errors" ("import_job_id", "row_number");
