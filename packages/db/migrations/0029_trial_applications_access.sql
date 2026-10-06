-- Trial applications are platform data: the platform API reviews them and deletes the ones that never became a tenant
-- after a year. The tenant API's default privileges on new tables are taken back.
GRANT SELECT, INSERT, UPDATE, DELETE ON trial_applications TO yutis_platform;
--> statement-breakpoint
REVOKE ALL ON trial_applications FROM yutis_app;
--> statement-breakpoint
ALTER TABLE trial_applications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_all ON trial_applications TO yutis_platform USING (true) WITH CHECK (true);
