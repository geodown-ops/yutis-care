-- Marketing-site chat is platform data: the platform API answers visitors and staff, and deletes conversations with no
-- message for a year. The tenant API's default privileges on new tables are taken back.
GRANT SELECT, INSERT, UPDATE, DELETE ON chat_conversations, chat_messages TO yutis_platform;
--> statement-breakpoint
REVOKE ALL ON chat_conversations, chat_messages FROM yutis_app;
--> statement-breakpoint
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_all ON chat_conversations TO yutis_platform USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY platform_all ON chat_messages TO yutis_platform USING (true) WITH CHECK (true);
