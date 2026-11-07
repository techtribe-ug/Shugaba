ALTER TABLE "memberships" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "refund_due" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "refund_paid" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "open_seat_covered" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "replaces_membership_id" text;