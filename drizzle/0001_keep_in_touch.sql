CREATE TYPE "public"."keep_in_touch_frequency" AS ENUM('week', 'month', 'quarter', 'year');--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "keep_in_touch_frequency" "keep_in_touch_frequency";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "keep_in_touch_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "last_contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_keep_in_touch_set_at_check" CHECK (("contacts"."keep_in_touch_frequency" is null) = ("contacts"."keep_in_touch_set_at" is null));