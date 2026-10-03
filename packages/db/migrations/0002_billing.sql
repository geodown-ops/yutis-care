CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."usage_metric" AS ENUM('active_employees', 'sms_sent');--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"pricing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tenant_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'trial' NOT NULL,
	"seat_limit" integer,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"billing_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_subscriptions_term" CHECK ("tenant_subscriptions"."ends_on" is null or "tenant_subscriptions"."ends_on" >= "tenant_subscriptions"."starts_on"),
	CONSTRAINT "tenant_subscriptions_seat_limit" CHECK ("tenant_subscriptions"."seat_limit" is null or "tenant_subscriptions"."seat_limit" > 0)
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"tenant_id" uuid NOT NULL,
	"period" date NOT NULL,
	"metric" "usage_metric" NOT NULL,
	"quantity" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_tenant_id_period_metric_pk" PRIMARY KEY("tenant_id","period","metric"),
	CONSTRAINT "usage_counters_period_is_month" CHECK (extract(day from "usage_counters"."period") = 1),
	CONSTRAINT "usage_counters_quantity" CHECK ("usage_counters"."quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;