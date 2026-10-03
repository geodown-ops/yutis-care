CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"requested_by" uuid NOT NULL,
	"params" jsonb NOT NULL,
	"format" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"file_name" text,
	"content_enc" "bytea",
	"error" text,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"download_token_hash" text,
	"download_token_expires_at" timestamp with time zone,
	CONSTRAINT "exports_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "exports_download_token_hash_unique" UNIQUE("download_token_hash")
);
--> statement-breakpoint
CREATE TABLE "retention_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"table_name" text NOT NULL,
	"row_id" uuid NOT NULL,
	"employee_id" uuid,
	"retain_until" date NOT NULL,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retention_findings_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "retention_findings_tenant_id_table_name_row_id_unique" UNIQUE("tenant_id","table_name","row_id")
);
--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_requested_by_fk" FOREIGN KEY ("tenant_id","requested_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_findings" ADD CONSTRAINT "retention_findings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exports_requester_idx" ON "exports" USING btree ("tenant_id","requested_by","created_at");