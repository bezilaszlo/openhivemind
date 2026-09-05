CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TABLE "agent_message" (
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"rev" integer NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"hash" text NOT NULL,
	"data" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_session" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"parent_session_id" text,
	"parent_external_id" text,
	"remote" text NOT NULL,
	"branch" text NOT NULL,
	"meta" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_token" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_sha256" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_token_token_sha256_unique" UNIQUE("token_sha256")
);
--> statement-breakpoint
CREATE TABLE "bootstrap" (
	"id" integer PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change" (
	"cursor" bigserial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text,
	"role" text NOT NULL,
	"token_sha256" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"accepted_by" text,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "invite_token_sha256_unique" UNIQUE("token_sha256")
);
--> statement-breakpoint
CREATE TABLE "purge_tombstone" (
	"org_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"purged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigserial NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_message" ADD CONSTRAINT "agent_message_session_id_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootstrap" ADD CONSTRAINT "bootstrap_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change" ADD CONSTRAINT "change_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "auth"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purge_tombstone" ADD CONSTRAINT "purge_tombstone_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "auth"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_sequence" ON "agent_message" USING btree ("session_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "session_identity" ON "agent_session" USING btree ("org_id","source","external_id");--> statement-breakpoint
CREATE INDEX "session_activity" ON "agent_session" USING btree ("org_id","last_activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tombstone_identity" ON "purge_tombstone" USING btree ("org_id","source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "auth"."account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "auth"."invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "auth"."invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "auth"."member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "auth"."member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "auth"."verification" USING btree ("identifier");