-- Payment orders are platform data: platform staff create, cancel and mark them paid, and the public payment page
-- (through the platform API) records the card payment. Never deleted, so the payment history stays. The tenant API's
-- default privileges on new tables are taken back.
GRANT SELECT, INSERT, UPDATE ON payment_orders TO yutis_platform;
--> statement-breakpoint
REVOKE ALL ON payment_orders FROM yutis_app;
--> statement-breakpoint
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_all ON payment_orders TO yutis_platform USING (true) WITH CHECK (true);
