CREATE TYPE "public"."credential_token_kind" AS ENUM('access', 'refresh');--> statement-breakpoint
CREATE TYPE "public"."exposure_actor" AS ENUM('agent', 'user', 'system');--> statement-breakpoint
CREATE TYPE "public"."grant_kind" AS ENUM('writer', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."grant_mode" AS ENUM('rotating', 'static');--> statement-breakpoint
CREATE TYPE "public"."grant_revoked_by" AS ENUM('owner', 'agent', 'reuse_detected', 'system');--> statement-breakpoint
CREATE TYPE "public"."page_kind" AS ENUM('living', 'standing');--> statement-breakpoint
CREATE TYPE "public"."view_origin" AS ENUM('message', 'home', 'direct');--> statement-breakpoint
CREATE TYPE "public"."write_kind" AS ENUM('create', 'patch', 'rewrite');--> statement-breakpoint
CREATE TABLE "asset_blobs" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace_id" uuid NOT NULL,
	"resource_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"stored_at" timestamp with time zone,
	"upload_expires_at" timestamp with time zone NOT NULL,
	"sha256" text,
	"width" integer,
	"height" integer,
	"thumb_bytes" "bytea",
	"thumb_media_type" text,
	"thumb_width" integer,
	"thumb_height" integer,
	"credit" text,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "assets_size_bytes_positive" CHECK ("assets"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "credential_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"kind" "credential_token_kind" NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"parent_id" uuid,
	"expires_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credential_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "credential_tokens_expiry_after_creation" CHECK ("credential_tokens"."expires_at" IS NULL OR "credential_tokens"."expires_at" > "credential_tokens"."created_at")
);
--> statement-breakpoint
CREATE TABLE "decision_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"page_title" text NOT NULL,
	"space_name" text,
	"approval_id" text NOT NULL,
	"ask_seq" integer NOT NULL,
	"question_key" text NOT NULL,
	"question" text NOT NULL,
	"context" text,
	"options" jsonb NOT NULL,
	"chosen_id" text NOT NULL,
	"chosen_label" text NOT NULL,
	"answered_by" text NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"page_deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exposure_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"shared" boolean NOT NULL,
	"actor" "exposure_actor" NOT NULL,
	"on_behalf_of_user" boolean DEFAULT false NOT NULL,
	"grant_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace_id" uuid NOT NULL,
	"kind" "grant_kind" NOT NULL,
	"driver" text NOT NULL,
	"label" text NOT NULL,
	"mode" "grant_mode" DEFAULT 'rotating' NOT NULL,
	"scope" text[] DEFAULT '{}'::text[] NOT NULL,
	"issued_by_grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" "grant_revoked_by",
	CONSTRAINT "grants_revocation_consistent" CHECK (("grants"."revoked_at" IS NULL AND "grants"."revoked_by" IS NULL) OR ("grants"."revoked_at" IS NOT NULL AND "grants"."revoked_by" IS NOT NULL)),
	CONSTRAINT "grants_viewer_scope_read_only" CHECK ("grants"."kind" <> 'viewer' OR "grants"."scope" <@ ARRAY['pages:read']::text[]),
	CONSTRAINT "grants_label_length" CHECK (char_length("grants"."label") BETWEEN 1 AND 40),
	CONSTRAINT "grants_scope_ceiling" CHECK ("grants"."scope" <@ ARRAY['pages:read','pages:write','namespace:pair']::text[])
);
--> statement-breakpoint
CREATE TABLE "namespace_usage" (
	"namespace_id" uuid NOT NULL,
	"day" date NOT NULL,
	"page_writes" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "namespace_usage_namespace_id_day_pk" PRIMARY KEY("namespace_id","day"),
	CONSTRAINT "namespace_usage_page_writes_nonnegative" CHECK ("namespace_usage"."page_writes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "namespaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_user_id" text,
	"email" text,
	"display_name" text,
	"person_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "namespaces_workos_user_id_unique" UNIQUE("workos_user_id"),
	CONSTRAINT "namespaces_identity_consistent" CHECK (("namespaces"."workos_user_id" IS NULL) = ("namespaces"."email" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "owner_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace_id" uuid NOT NULL,
	"session_hash" text NOT NULL,
	"client_label" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_sessions_session_hash_unique" UNIQUE("session_hash"),
	CONSTRAINT "owner_sessions_expiry_after_creation" CHECK ("owner_sessions"."expires_at" > "owner_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "page_asks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"approval_id" text NOT NULL,
	"ask_seq" integer NOT NULL,
	"question_key" text NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "page_user_state" (
	"page_id" uuid PRIMARY KEY NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_writes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"grant_id" uuid,
	"version" integer NOT NULL,
	"summary" text NOT NULL,
	"kind" "write_kind",
	"asset_refs" text[] DEFAULT '{}'::text[] NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"kind" "page_kind" DEFAULT 'living' NOT NULL,
	"updating_until" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"document" jsonb NOT NULL,
	"registry_version" integer,
	"sealed_read_key" text NOT NULL,
	"last_summary" text NOT NULL,
	"read_key_hash" text NOT NULL,
	"source_event" jsonb,
	"shared" boolean DEFAULT false NOT NULL,
	"exposure_actor" "exposure_actor" DEFAULT 'system' NOT NULL,
	"exposure_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shared_at" timestamp with time zone,
	"last_writer_grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"live_steps" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pages_shared_at_consistent" CHECK (("pages"."shared" AND "pages"."shared_at" IS NOT NULL) OR (NOT "pages"."shared" AND "pages"."shared_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "rate_limit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"share_key_hash" text,
	"sealed_share_key" text,
	"shared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_id_namespace_id_unique" UNIQUE("id","namespace_id"),
	CONSTRAINT "spaces_share_state_consistent" CHECK (("spaces"."share_key_hash" IS NULL) = ("spaces"."sealed_share_key" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "view_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"origin" "view_origin" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_blobs" ADD CONSTRAINT "asset_blobs_storage_key_assets_storage_key_fk" FOREIGN KEY ("storage_key") REFERENCES "public"."assets"("storage_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_tokens" ADD CONSTRAINT "credential_tokens_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_tokens" ADD CONSTRAINT "credential_tokens_parent_id_credential_tokens_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."credential_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log" ADD CONSTRAINT "decision_log_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_log" ADD CONSTRAINT "exposure_log_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_log" ADD CONSTRAINT "exposure_log_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_log" ADD CONSTRAINT "exposure_log_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_issued_by_grant_id_grants_id_fk" FOREIGN KEY ("issued_by_grant_id") REFERENCES "public"."grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "namespace_usage" ADD CONSTRAINT "namespace_usage_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_sessions" ADD CONSTRAINT "owner_sessions_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_asks" ADD CONSTRAINT "page_asks_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_user_state" ADD CONSTRAINT "page_user_state_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_writes" ADD CONSTRAINT "page_writes_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_writes" ADD CONSTRAINT "page_writes_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_last_writer_grant_id_grants_id_fk" FOREIGN KEY ("last_writer_grant_id") REFERENCES "public"."grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_space_id_namespace_id_spaces_id_namespace_id_fk" FOREIGN KEY ("space_id","namespace_id") REFERENCES "public"."spaces"("id","namespace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_log" ADD CONSTRAINT "view_log_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_resource_id_idx" ON "assets" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "assets_namespace_id_stored_at_idx" ON "assets" USING btree ("namespace_id","stored_at");--> statement-breakpoint
CREATE INDEX "credential_tokens_grant_id_kind_idx" ON "credential_tokens" USING btree ("grant_id","kind");--> statement-breakpoint
CREATE INDEX "credential_tokens_family_id_idx" ON "credential_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "credential_tokens_expires_at_idx" ON "credential_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "decision_log_page_id_approval_id_ask_seq_idx" ON "decision_log" USING btree ("page_id","approval_id","ask_seq");--> statement-breakpoint
CREATE INDEX "decision_log_namespace_id_answered_at_idx" ON "decision_log" USING btree ("namespace_id","answered_at");--> statement-breakpoint
CREATE INDEX "exposure_log_page_id_at_idx" ON "exposure_log" USING btree ("page_id","at");--> statement-breakpoint
CREATE INDEX "grants_namespace_id_revoked_at_idx" ON "grants" USING btree ("namespace_id","revoked_at");--> statement-breakpoint
CREATE INDEX "owner_sessions_namespace_id_revoked_at_idx" ON "owner_sessions" USING btree ("namespace_id","revoked_at");--> statement-breakpoint
CREATE INDEX "owner_sessions_expires_at_idx" ON "owner_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "owner_sessions_revoked_at_idx" ON "owner_sessions" USING btree ("revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "page_asks_page_id_approval_id_ask_seq_idx" ON "page_asks" USING btree ("page_id","approval_id","ask_seq");--> statement-breakpoint
CREATE INDEX "page_writes_page_id_at_idx" ON "page_writes" USING btree ("page_id","at");--> statement-breakpoint
CREATE INDEX "pages_namespace_id_updated_at_idx" ON "pages" USING btree ("namespace_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pages_space_id_shared_idx" ON "pages" USING btree ("space_id","shared");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_space_id_slug_idx" ON "pages" USING btree ("space_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_read_key_hash_idx" ON "pages" USING btree ("read_key_hash");--> statement-breakpoint
CREATE INDEX "rate_limit_events_bucket_key_created_at_idx" ON "rate_limit_events" USING btree ("bucket","key","created_at");--> statement-breakpoint
CREATE INDEX "rate_limit_events_bucket_created_at_idx" ON "rate_limit_events" USING btree ("bucket","created_at");--> statement-breakpoint
CREATE INDEX "rate_limit_events_created_at_idx" ON "rate_limit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "spaces_namespace_id_idx" ON "spaces" USING btree ("namespace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_namespace_id_slug_idx" ON "spaces" USING btree ("namespace_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_share_key_hash_idx" ON "spaces" USING btree ("share_key_hash");--> statement-breakpoint
CREATE INDEX "view_log_page_id_at_idx" ON "view_log" USING btree ("page_id","at");--> statement-breakpoint
CREATE INDEX "view_log_at_idx" ON "view_log" USING btree ("at");