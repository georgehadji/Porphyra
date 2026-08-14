DROP INDEX "usage_counters_user_period_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_user_period_idx" ON "usage_counters" USING btree ("user_id","period_start");