CREATE TYPE "public"."chat_author" AS ENUM('visitor', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."chat_conversation_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "chat_conversation_status" DEFAULT 'open' NOT NULL,
	"visitor_name" text NOT NULL,
	"visitor_email" text,
	"company_name" text,
	"token_hash" text NOT NULL,
	"ip_hash" text NOT NULL,
	"page" text,
	"consented_at" timestamp with time zone NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"visitor_seen_at" timestamp with time zone,
	"staff_read_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_conversations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author" "chat_author" NOT NULL,
	"staff_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_closed_by_platform_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_staff_id_platform_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_conversations_status_idx" ON "chat_conversations" USING btree ("status","last_message_at");--> statement-breakpoint
CREATE INDEX "chat_conversations_ip_idx" ON "chat_conversations" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_idx" ON "chat_messages" USING btree ("conversation_id","created_at");