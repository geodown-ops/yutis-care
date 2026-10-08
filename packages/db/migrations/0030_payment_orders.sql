CREATE TYPE "public"."payment_order_status" AS ENUM('pending', 'paid', 'cancelled');--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_number" text NOT NULL,
	"token" text NOT NULL,
	"status" "payment_order_status" DEFAULT 'pending' NOT NULL,
	"amount" integer NOT NULL,
	"description" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"seat_limit" integer,
	"period_starts_on" date NOT NULL,
	"period_ends_on" date,
	"payer_name" text NOT NULL,
	"payer_email" text NOT NULL,
	"expires_on" date NOT NULL,
	"method" text,
	"gateway_env" text,
	"pending_trade_id" text,
	"rec_trade_id" text,
	"bank_transaction_id" text,
	"card_last_four" text,
	"paid_note" text,
	"paid_at" timestamp with time zone,
	"subscription_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "payment_orders_token_unique" UNIQUE("token"),
	CONSTRAINT "payment_orders_amount" CHECK ("payment_orders"."amount" > 0),
	CONSTRAINT "payment_orders_seat_limit" CHECK ("payment_orders"."seat_limit" is null or "payment_orders"."seat_limit" > 0),
	CONSTRAINT "payment_orders_term" CHECK ("payment_orders"."period_ends_on" is null or "payment_orders"."period_ends_on" >= "payment_orders"."period_starts_on"),
	CONSTRAINT "payment_orders_paid" CHECK (("payment_orders"."status" = 'paid') = ("payment_orders"."paid_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_subscription_id_tenant_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."tenant_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_created_by_platform_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_orders_tenant_idx" ON "payment_orders" USING btree ("tenant_id","created_at");