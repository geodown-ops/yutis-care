CREATE TYPE "public"."announcement_kind" AS ENUM('maintenance', 'feature', 'notice');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('營運', '客服', '工程');--> statement-breakpoint
CREATE TYPE "public"."template_kind" AS ENUM('grading_rules', 'phrases', 'sign_off_roles', 'survey_versions');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"kind" "announcement_kind" DEFAULT 'notice' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"publish_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "default_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "template_kind" NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "default_templates_kind_version_unique" UNIQUE("kind","version")
);
--> statement-breakpoint
CREATE TABLE "platform_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"tenant_id" uuid,
	"subject_table" text,
	"subject_id" text,
	"detail" jsonb,
	"ip" "inet",
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "platform_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "support_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"platform_user_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "support_access_grants_tenant_id_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "tenant_settings_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "tenant_settings_tenant_id_key_unique" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "idp_tenant_id" text;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_platform_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "default_templates" ADD CONSTRAINT "default_templates_created_by_platform_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_platform_user_id_platform_users_id_fk" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_granted_by_fk" FOREIGN KEY ("tenant_id","granted_by") REFERENCES "public"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "default_templates_one_active" ON "default_templates" USING btree ("kind") WHERE "default_templates"."active";--> statement-breakpoint
CREATE INDEX "platform_audit_log_tenant_idx" ON "platform_audit_log" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "platform_audit_log_actor_idx" ON "platform_audit_log" USING btree ("actor_id","at");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_slug_format" CHECK ("tenants"."slug" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' and "tenants"."slug" not in ('admin', 'api', 'www'));