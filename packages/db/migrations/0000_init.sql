CREATE TYPE "public"."case_status" AS ENUM('未開單', '起單', '處理中', '結案');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('hc', 'sp', 'wl', 'er', 'mat', 'age');--> statement-breakpoint
CREATE TYPE "public"."filled_by" AS ENUM('self', 'nurse');--> statement-breakpoint
CREATE TYPE "public"."mat_level" AS ENUM('第一級管理', '第二級管理', '第三級管理');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('男', '女');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('職護', '職醫', '職安衛人員', '人資', '部門主管', '租戶管理員');--> statement-breakpoint
CREATE TYPE "public"."survey_status" AS ENUM('未填寫', '已填寫');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('read', 'create', 'update', 'delete', 'export', 'sign_in', 'break_glass');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"kms_key_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"site_id" uuid NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"manager_name" text,
	"manager_email" text,
	"manager_phone" text,
	CONSTRAINT "departments_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "legal_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "legal_entities_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"legal_entity_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	CONSTRAINT "sites_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "break_glass_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"user_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "break_glass_grants_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "user_site_scopes" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	CONSTRAINT "user_site_scopes_tenant_id_user_id_site_id_pk" PRIMARY KEY("tenant_id","user_id","site_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"phone" text,
	"qualification" text,
	"idp_issuer" text,
	"idp_subject" text,
	"mfa_enrolled" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	CONSTRAINT "users_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "users_tenant_id_email_unique" UNIQUE("tenant_id","email"),
	CONSTRAINT "users_tenant_id_idp_issuer_idp_subject_unique" UNIQUE("tenant_id","idp_issuer","idp_subject")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"emp_no" text NOT NULL,
	"name" text NOT NULL,
	"sex" "sex" NOT NULL,
	"birth_date" date NOT NULL,
	"national_id_hash" text,
	"legal_entity_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"title" text,
	"shift" text,
	"exam_category" text,
	"special_operations" text[] DEFAULT '{}' NOT NULL,
	"lang" text DEFAULT 'zh' NOT NULL,
	"hire_date" date,
	"email" text,
	"phone" text,
	"status" text DEFAULT '在職' NOT NULL,
	CONSTRAINT "employees_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "employees_tenant_id_emp_no_unique" UNIQUE("tenant_id","emp_no")
);
--> statement-breakpoint
CREATE TABLE "exam_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"clinic" text NOT NULL,
	"file_name" text,
	"mapping" jsonb,
	"row_count" integer,
	"status" text DEFAULT 'uploaded' NOT NULL,
	CONSTRAINT "exam_batches_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "grading_rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_from" date,
	"note" text,
	CONSTRAINT "grading_rule_sets_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "grading_rule_sets_tenant_id_version_unique" UNIQUE("tenant_id","version")
);
--> statement-breakpoint
CREATE TABLE "grading_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"rule_set_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"name" text NOT NULL,
	"sex" text NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"value_type" text DEFAULT 'number' NOT NULL,
	"levels" jsonb NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "grading_rules_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "health_exam_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"exam_id" uuid NOT NULL,
	"item_code" text NOT NULL,
	"value_num" numeric,
	"value_text" text,
	"grade" smallint,
	CONSTRAINT "health_exam_results_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "health_exam_results_tenant_id_exam_id_item_code_unique" UNIQUE("tenant_id","exam_id","item_code")
);
--> statement-breakpoint
CREATE TABLE "health_exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"employee_id" uuid NOT NULL,
	"batch_id" uuid,
	"exam_date" date NOT NULL,
	"clinic" text,
	"kind" text NOT NULL,
	"rule_set_id" uuid NOT NULL,
	"grade_total" integer NOT NULL,
	"grade_max" smallint NOT NULL,
	"special_hazard" text,
	"special_level" smallint,
	"smoker" boolean,
	"lifestyle" jsonb,
	"history_enc" "bytea",
	"symptoms_enc" "bytea",
	"work_note_enc" "bytea",
	"retain_until" date,
	CONSTRAINT "health_exams_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "assist_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"employee_id" uuid NOT NULL,
	"category" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"consult_types" text[] DEFAULT '{}' NOT NULL,
	"lifestyle_advice" text[] DEFAULT '{}' NOT NULL,
	"content_enc" "bytea",
	"helpers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" text NOT NULL,
	"follow_up_on" date,
	"follow_up_user_id" uuid,
	"follow_up_done" boolean DEFAULT false NOT NULL,
	"draft" boolean DEFAULT false NOT NULL,
	"retain_until" date,
	CONSTRAINT "assist_records_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"employee_id" uuid NOT NULL,
	"case_id" uuid,
	"type" "event_type" NOT NULL,
	"source_table" text NOT NULL,
	"source_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"description" text NOT NULL,
	"status" "case_status" DEFAULT '未開單' NOT NULL,
	CONSTRAINT "case_events_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "case_events_tenant_id_source_table_source_id_type_unique" UNIQUE("tenant_id","source_table","source_id","type")
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"employee_id" uuid NOT NULL,
	"status" "case_status" DEFAULT '起單' NOT NULL,
	"lead_user_id" uuid,
	"opened_on" date NOT NULL,
	"notice_on" date,
	"planned_on" date,
	"replied_on" date,
	"agreed" boolean,
	"closed_on" date,
	CONSTRAINT "cases_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "event_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"event_id" uuid NOT NULL,
	"from_status" "case_status",
	"to_status" "case_status" NOT NULL,
	"note" text,
	CONSTRAINT "event_status_history_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "phrases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"category" text NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "phrases_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "ergo_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"name" text NOT NULL,
	"sent_on" date NOT NULL,
	"due_on" date,
	CONSTRAINT "ergo_dispatches_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "ergo_injuries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"employee_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"body_part" text NOT NULL,
	"description" text,
	"leave_days" numeric,
	CONSTRAINT "ergo_injuries_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "ergo_measures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"survey_id" uuid NOT NULL,
	"measures" text[] DEFAULT '{}' NOT NULL,
	"note" text,
	"tracked_on" date,
	"status" text DEFAULT '列管中' NOT NULL,
	CONSTRAINT "ergo_measures_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "ergo_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"dispatch_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"status" "survey_status" DEFAULT '未填寫' NOT NULL,
	"lang" text DEFAULT 'zh' NOT NULL,
	"form_version" text NOT NULL,
	"answers" jsonb,
	"max_score" smallint,
	"suspected_hazard" boolean,
	"filled_at" timestamp with time zone,
	"filled_by" "filled_by",
	"reminders" integer DEFAULT 0 NOT NULL,
	"last_reminded_at" timestamp with time zone,
	"retain_until" date,
	CONSTRAINT "ergo_surveys_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"assessment_id" uuid NOT NULL,
	"status" text DEFAULT '待安排' NOT NULL,
	"interviewed_on" date,
	"doctor_user_id" uuid,
	"work_advice" jsonb,
	"notes_enc" "bytea",
	"next_on" date,
	CONSTRAINT "interviews_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "maternal_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"employee_id" uuid NOT NULL,
	"type" text NOT NULL,
	"notified_on" date NOT NULL,
	"due_date" date,
	"birth_date" date,
	"env_assessment_id" uuid,
	"level" "mat_level",
	"detail_enc" "bytea",
	"retain_until" date,
	CONSTRAINT "maternal_cases_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "maternal_env_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"site_id" uuid NOT NULL,
	"department_id" uuid,
	"area" text NOT NULL,
	"shift_type" text,
	"assessed_on" date NOT NULL,
	"hazards" jsonb NOT NULL,
	"level" "mat_level" NOT NULL,
	CONSTRAINT "maternal_env_assessments_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "maternal_interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"case_id" uuid NOT NULL,
	"interviewed_on" date NOT NULL,
	"staff_user_id" uuid,
	"fit_advice" text,
	"limits" text[] DEFAULT '{}' NOT NULL,
	"agreed_arrangement" text,
	"notes_enc" "bytea",
	CONSTRAINT "maternal_interviews_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "violence_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"kind" text NOT NULL,
	"site_id" uuid NOT NULL,
	"checked_on" date NOT NULL,
	"items" jsonb NOT NULL,
	CONSTRAINT "violence_checklists_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "violence_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"occurred_on" date NOT NULL,
	"site_id" uuid NOT NULL,
	"type" text NOT NULL,
	"victim_employee_id" uuid,
	"detail_enc" "bytea",
	"follow_ups" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT '處理中' NOT NULL,
	"retain_until" date,
	CONSTRAINT "violence_incidents_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "violence_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"reviewed_on" date NOT NULL,
	"items" jsonb NOT NULL,
	CONSTRAINT "violence_reviews_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "violence_risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"site_id" uuid NOT NULL,
	"department_id" uuid,
	"assessed_on" date NOT NULL,
	"items" jsonb NOT NULL,
	CONSTRAINT "violence_risk_assessments_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "workload_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"employee_id" uuid NOT NULL,
	"sent_on" date NOT NULL,
	"cbi_answers" jsonb,
	"personal_burnout" numeric,
	"work_burnout" numeric,
	"fatigue_at" timestamp with time zone,
	"fatigue_by" "filled_by",
	"overtime_1m" numeric,
	"overtime_6m_avg" numeric,
	"work_patterns" text[] DEFAULT '{}' NOT NULL,
	"overload_at" timestamp with time zone,
	"exam_id" uuid,
	"evaluation" jsonb,
	"risk_level" smallint,
	"rule_version" text,
	"retain_until" date,
	CONSTRAINT "workload_assessments_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"subject_table" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	CONSTRAINT "attachments_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"employee_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"purpose" text NOT NULL,
	"document_version" text NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "consents_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "employee_acknowledgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"employee_id" uuid NOT NULL,
	"subject_table" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"comment" text,
	CONSTRAINT "employee_acknowledgements_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "employee_acknowledgements_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"recipient_email" text NOT NULL,
	"template" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "notifications_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "service_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"service_on" date NOT NULL,
	"site_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"status" text DEFAULT '草稿' NOT NULL,
	CONSTRAINT "service_records_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"subject_table" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"signer_role" text NOT NULL,
	"signer_name" text NOT NULL,
	"signer_email" text NOT NULL,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"first_sent_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"comment" text,
	CONSTRAINT "signatures_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "signatures_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_employee_id" uuid,
	"action" "audit_action" NOT NULL,
	"subject_table" text,
	"subject_id" uuid,
	"employee_id" uuid,
	"data_category" text,
	"reason" text,
	"ip" "inet",
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_site_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_legal_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_glass_grants" ADD CONSTRAINT "break_glass_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_glass_grants" ADD CONSTRAINT "break_glass_grants_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_glass_grants" ADD CONSTRAINT "break_glass_grants_site_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_site_scopes" ADD CONSTRAINT "user_site_scopes_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_site_scopes" ADD CONSTRAINT "user_site_scopes_site_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_legal_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_site_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_fk" FOREIGN KEY ("tenant_id","department_id") REFERENCES "public"."departments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_batches" ADD CONSTRAINT "exam_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_rule_sets" ADD CONSTRAINT "grading_rule_sets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_rules" ADD CONSTRAINT "grading_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_rules" ADD CONSTRAINT "grading_rules_rule_set_fk" FOREIGN KEY ("tenant_id","rule_set_id") REFERENCES "public"."grading_rule_sets"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_exam_results" ADD CONSTRAINT "health_exam_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_exam_results" ADD CONSTRAINT "health_exam_results_exam_fk" FOREIGN KEY ("tenant_id","exam_id") REFERENCES "public"."health_exams"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_exams" ADD CONSTRAINT "health_exams_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_exams" ADD CONSTRAINT "health_exams_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_exams" ADD CONSTRAINT "health_exams_batch_fk" FOREIGN KEY ("tenant_id","batch_id") REFERENCES "public"."exam_batches"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_exams" ADD CONSTRAINT "health_exams_rule_set_fk" FOREIGN KEY ("tenant_id","rule_set_id") REFERENCES "public"."grading_rule_sets"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_records" ADD CONSTRAINT "assist_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_records" ADD CONSTRAINT "assist_records_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_records" ADD CONSTRAINT "assist_records_follow_up_user_fk" FOREIGN KEY ("tenant_id","follow_up_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_fk" FOREIGN KEY ("tenant_id","case_id") REFERENCES "public"."cases"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_lead_user_fk" FOREIGN KEY ("tenant_id","lead_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_status_history" ADD CONSTRAINT "event_status_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_status_history" ADD CONSTRAINT "event_status_history_event_fk" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."case_events"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phrases" ADD CONSTRAINT "phrases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ergo_dispatches" ADD CONSTRAINT "ergo_dispatches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ergo_injuries" ADD CONSTRAINT "ergo_injuries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ergo_injuries" ADD CONSTRAINT "ergo_injuries_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ergo_measures" ADD CONSTRAINT "ergo_measures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ergo_measures" ADD CONSTRAINT "ergo_measures_survey_fk" FOREIGN KEY ("tenant_id","survey_id") REFERENCES "public"."ergo_surveys"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ergo_surveys" ADD CONSTRAINT "ergo_surveys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ergo_surveys" ADD CONSTRAINT "ergo_surveys_dispatch_fk" FOREIGN KEY ("tenant_id","dispatch_id") REFERENCES "public"."ergo_dispatches"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ergo_surveys" ADD CONSTRAINT "ergo_surveys_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_assessment_fk" FOREIGN KEY ("tenant_id","assessment_id") REFERENCES "public"."workload_assessments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_doctor_fk" FOREIGN KEY ("tenant_id","doctor_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_cases" ADD CONSTRAINT "maternal_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_cases" ADD CONSTRAINT "maternal_cases_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_cases" ADD CONSTRAINT "maternal_cases_env_fk" FOREIGN KEY ("tenant_id","env_assessment_id") REFERENCES "public"."maternal_env_assessments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_env_assessments" ADD CONSTRAINT "maternal_env_assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_env_assessments" ADD CONSTRAINT "maternal_env_assessments_site_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_env_assessments" ADD CONSTRAINT "maternal_env_assessments_department_fk" FOREIGN KEY ("tenant_id","department_id") REFERENCES "public"."departments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_interviews" ADD CONSTRAINT "maternal_interviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_interviews" ADD CONSTRAINT "maternal_interviews_case_fk" FOREIGN KEY ("tenant_id","case_id") REFERENCES "public"."maternal_cases"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternal_interviews" ADD CONSTRAINT "maternal_interviews_staff_fk" FOREIGN KEY ("tenant_id","staff_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violence_checklists" ADD CONSTRAINT "violence_checklists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violence_checklists" ADD CONSTRAINT "violence_checklists_site_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violence_incidents" ADD CONSTRAINT "violence_incidents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violence_incidents" ADD CONSTRAINT "violence_incidents_site_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violence_incidents" ADD CONSTRAINT "violence_incidents_victim_fk" FOREIGN KEY ("tenant_id","victim_employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violence_reviews" ADD CONSTRAINT "violence_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violence_risk_assessments" ADD CONSTRAINT "violence_risk_assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violence_risk_assessments" ADD CONSTRAINT "violence_risk_assessments_site_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violence_risk_assessments" ADD CONSTRAINT "violence_risk_assessments_department_fk" FOREIGN KEY ("tenant_id","department_id") REFERENCES "public"."departments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_assessments" ADD CONSTRAINT "workload_assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_assessments" ADD CONSTRAINT "workload_assessments_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workload_assessments" ADD CONSTRAINT "workload_assessments_exam_fk" FOREIGN KEY ("tenant_id","exam_id") REFERENCES "public"."health_exams"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_acknowledgements" ADD CONSTRAINT "employee_acknowledgements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_acknowledgements" ADD CONSTRAINT "employee_acknowledgements_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_site_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_exams_employee_idx" ON "health_exams" USING btree ("tenant_id","employee_id","exam_date");--> statement-breakpoint
CREATE INDEX "assist_records_employee_idx" ON "assist_records" USING btree ("tenant_id","employee_id","occurred_at");--> statement-breakpoint
CREATE INDEX "case_events_employee_idx" ON "case_events" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "ergo_surveys_employee_idx" ON "ergo_surveys" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "workload_assessments_employee_idx" ON "workload_assessments" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_employee_idx" ON "audit_log" USING btree ("tenant_id","employee_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_actor_idx" ON "audit_log" USING btree ("tenant_id","actor_user_id","at");