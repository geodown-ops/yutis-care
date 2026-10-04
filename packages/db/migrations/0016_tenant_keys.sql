CREATE TABLE "tenant_keys" (
	"tenant_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"wrapped_key" "bytea" NOT NULL,
	"kms_key_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_keys_tenant_id_purpose_pk" PRIMARY KEY("tenant_id","purpose")
);
--> statement-breakpoint
ALTER TABLE "tenant_keys" ADD CONSTRAINT "tenant_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;