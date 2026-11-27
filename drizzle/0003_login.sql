CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_link_requests" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_groups" DROP CONSTRAINT "contact_groups_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "contact_groups" DROP CONSTRAINT "contact_groups_group_id_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "contact_groups" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "owner_id" text;--> statement-breakpoint
DO $$
DECLARE
	owner_email text := nullif(current_setting('crm.owner_email', true), '');
	owner_user_id text;
	contact_count bigint := (SELECT count(*) FROM "contacts");
	group_count bigint := (SELECT count(*) FROM "groups");
	note_count bigint := (SELECT count(*) FROM "notes");
	membership_count bigint := (SELECT count(*) FROM "contact_groups");
BEGIN
	IF contact_count > 0 OR group_count > 0 THEN
		IF owner_email IS NULL THEN
			RAISE EXCEPTION 'Set a valid CRM_OWNER_EMAIL before migrating existing CRM data';
		END IF;

		INSERT INTO "user" ("id", "name", "email")
		VALUES (gen_random_uuid()::text, '', owner_email)
		ON CONFLICT ("email") DO NOTHING;
		SELECT "id" INTO STRICT owner_user_id FROM "user" WHERE "email" = owner_email;

		UPDATE "contacts" SET "owner_id" = owner_user_id;
		UPDATE "groups" SET "owner_id" = owner_user_id;
		UPDATE "contact_groups" SET "owner_id" = owner_user_id;
	END IF;

	IF contact_count <> (SELECT count(*) FROM "contacts")
		OR group_count <> (SELECT count(*) FROM "groups")
		OR note_count <> (SELECT count(*) FROM "notes")
		OR membership_count <> (SELECT count(*) FROM "contact_groups")
	THEN
		RAISE EXCEPTION 'CRM row counts changed during ownership migration';
	END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "contact_groups" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "magic_link_requests_email_created_at_idx" ON "magic_link_requests" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_id_unique" UNIQUE("owner_id","id");--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_id_unique" UNIQUE("owner_id","id");--> statement-breakpoint
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_owner_contact_fk" FOREIGN KEY ("owner_id","contact_id") REFERENCES "public"."contacts"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_owner_group_fk" FOREIGN KEY ("owner_id","group_id") REFERENCES "public"."groups"("owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
